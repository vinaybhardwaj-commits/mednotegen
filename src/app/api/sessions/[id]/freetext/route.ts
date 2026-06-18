import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseFreeText } from "@/lib/notes/freetext-parse";
import { computeNudges } from "@/lib/notes/nudge";
import type { NoteType } from "@/lib/notes/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/sessions/:id/freetext  (Mode B)
 * Body: { raw_text }
 * Parses/expands the free text, maps it onto NABH field_keys, stores the mapped values as
 * answers, logs expansions, and returns the mapped fields + expansions + gap nudges.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const rawText = String(body.raw_text ?? "").trim();
  if (!rawText) return NextResponse.json({ error: "raw_text required" }, { status: 400 });

  const rows = (await sql`SELECT note_type FROM note_sessions WHERE id = ${params.id} LIMIT 1`) as any[];
  if (!rows.length) return NextResponse.json({ error: "session not found" }, { status: 404 });
  const noteType = rows[0].note_type as NoteType;

  try {
    const parsed = await parseFreeText(noteType, rawText);

    // Persist mapped values as answers (source 'typed' — they originate from the doctor).
    for (const [field_key, value] of Object.entries(parsed.fields)) {
      await sql`
        INSERT INTO note_answers (session_id, field_key, value, source, updated_at)
        VALUES (${params.id}, ${field_key}, ${value}, 'typed', now())
        ON CONFLICT (session_id, field_key)
        DO UPDATE SET value = EXCLUDED.value, source = 'typed', updated_at = now()
      `;
    }

    // Log expansions so a curated EHRC abbreviation lexicon can accrue later.
    for (const e of parsed.expansions) {
      await sql`
        INSERT INTO expansion_log (session_id, note_type, from_text, to_text)
        VALUES (${params.id}, ${noteType}, ${e.from}, ${e.to})
      `;
    }

    await sql`
      UPDATE note_sessions SET raw_input = ${rawText}, status = 'answering', updated_at = now()
      WHERE id = ${params.id}
    `;
    await sql`
      INSERT INTO note_audit (session_id, event, actor, payload)
      VALUES (${params.id}, 'freetext_parsed', 'system',
              ${JSON.stringify({ mapped: Object.keys(parsed.fields).length, expansions: parsed.expansions.length })}::jsonb)
    `;

    const nudges = await computeNudges(noteType, parsed.fields);

    return NextResponse.json({
      mapped: parsed.fields,
      expansions: parsed.expansions,
      cleaned: parsed.cleaned,
      nudges,
    });
  } catch (e) {
    console.error("[freetext] failed", e);
    return NextResponse.json({ error: "parse_failed", detail: String(e) }, { status: 502 });
  }
}
