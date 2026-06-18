import { NextRequest, NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/sessions/:id/sign  (R5)
 * Body: { final_md, signed_by } — the final note text (incl. NABH-gaps footer) + signer.
 * Creates the signed generated_notes row, locks the session, writes the audit trail.
 * Works whether or not the doctor used compose (the note is whatever is in the editor).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const finalMd = String(body.final_md ?? "").trim();
  const signedBy = String(body.signed_by ?? "").trim();
  if (!finalMd || !signedBy) return NextResponse.json({ error: "final_md and signed_by required" }, { status: 400 });

  const noteId = genId("note");
  await sql`
    INSERT INTO generated_notes (id, session_id, final_md, signed_by, signed_at, version)
    VALUES (${noteId}, ${params.id}, ${finalMd}, ${signedBy}, now(), 1)
  `;
  await sql`UPDATE note_sessions SET status = 'signed', updated_at = now() WHERE id = ${params.id}`;
  await sql`
    INSERT INTO note_audit (session_id, event, actor, payload)
    VALUES (${params.id}, 'note_signed', ${signedBy}, ${JSON.stringify({ noteId, chars: finalMd.length })}::jsonb)
  `;

  return NextResponse.json({ ok: true, note_id: noteId });
}
