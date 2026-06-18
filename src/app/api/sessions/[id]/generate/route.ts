import { NextRequest, NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { loadFloor, validateCompleteness } from "@/lib/notes/nabh-gate";
import { generateSchema } from "@/lib/notes/question-engine";
import { compose } from "@/lib/notes/composer";
import { checkGroundingRules, mergeFaithfulness } from "@/lib/notes/faithfulness";
import { humanize } from "@/lib/notes/humanize";
import type { Answer, NoteType } from "@/lib/notes/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/sessions/:id/generate
 * compose (grounding contract) → faithfulness → NABH gate → humanize → persist.
 * Returns draft + grounding map + faithfulness flags + NABH status.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sRows = (await sql`
    SELECT note_type, procedure, patient_ref FROM note_sessions WHERE id = ${params.id} LIMIT 1
  `) as any[];
  if (!sRows.length) return NextResponse.json({ error: "session not found" }, { status: 404 });
  const noteType = sRows[0].note_type as NoteType;

  const aRows = (await sql`
    SELECT field_key, value, source, na_reason FROM note_answers WHERE session_id = ${params.id}
  `) as any[];
  const answers: Answer[] = aRows.map((r) => ({
    field_key: r.field_key, value: r.value, source: r.source, na_reason: r.na_reason,
  }));

  // 1) NABH completeness gate (blocks if incomplete)
  const floor = await loadFloor(noteType);
  const nabh = validateCompleteness(floor, answers);
  if (!nabh.complete) {
    return NextResponse.json({ blocked: true, reason: "nabh_incomplete", nabh }, { status: 422 });
  }

  try {
    // 2) Compose under the grounding contract
    const schema = await generateSchema(noteType, sRows[0].procedure ?? "");
    const meta = { title: "Operative Note", uhid: sRows[0].patient_ref ?? "" };
    const composed = await compose(noteType, schema.fields, answers, meta);

    // 3) Faithfulness (rules ⊕ composer grounding_map)
    const ruleReport = checkGroundingRules(composed.markdown, answers);
    const faithfulness = mergeFaithfulness(composed.grounding, ruleReport);

    // 4) Humanize (style only; reverts on fact drift)
    const humanized = await humanize(composed.markdown, answers);

    // 5) Persist draft + grounding map + audit
    const noteId = genId("note");
    await sql`
      INSERT INTO generated_notes (id, session_id, draft_md, humanized, version)
      VALUES (${noteId}, ${params.id}, ${humanized}, ${humanized !== composed.markdown}, 1)
    `;
    for (const g of composed.grounding) {
      await sql`
        INSERT INTO grounding_map (note_id, sentence_id, sentence_text, source_field_keys, supported)
        VALUES (${noteId}, ${g.sentence_id}, ${g.sentence_text},
                ${JSON.stringify(g.source_field_keys)}::jsonb, ${g.supported})
        ON CONFLICT (note_id, sentence_id) DO NOTHING
      `;
    }
    await sql`UPDATE note_sessions SET status = 'generated', updated_at = now() WHERE id = ${params.id}`;
    await sql`
      INSERT INTO note_audit (session_id, event, actor, payload)
      VALUES (${params.id}, 'note_generated', 'system',
              ${JSON.stringify({ noteId, faithful: faithfulness.ok })}::jsonb)
    `;

    return NextResponse.json({
      note_id: noteId,
      draft_md: humanized,
      nabh,
      faithfulness,
      grounding: composed.grounding,
    });
  } catch (e) {
    console.error("[generate] failed", e);
    return NextResponse.json({ error: "generation_failed", detail: String(e) }, { status: 502 });
  }
}
