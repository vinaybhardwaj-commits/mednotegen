import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

const VALID = new Set(["ot_note", "discharge_summary", "opd_rx"]);

/**
 * PUT /api/sessions/:id/editor  (R1 autosave)
 * Body: { editor_text?, note_type? } — persists the always-editable live document
 * and/or the selected note type. Idempotent; called on a debounce from the editor.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const editorText = typeof body.editor_text === "string" ? body.editor_text : null;
  const noteType = typeof body.note_type === "string" && VALID.has(body.note_type) ? body.note_type : null;
  if (editorText === null && noteType === null) {
    return NextResponse.json({ error: "nothing to save" }, { status: 400 });
  }

  if (editorText !== null && noteType !== null) {
    await sql`UPDATE note_sessions SET editor_text = ${editorText}, note_type = ${noteType}, status = 'answering', updated_at = now() WHERE id = ${params.id}`;
  } else if (editorText !== null) {
    await sql`UPDATE note_sessions SET editor_text = ${editorText}, status = 'answering', updated_at = now() WHERE id = ${params.id}`;
  } else {
    await sql`UPDATE note_sessions SET note_type = ${noteType}, updated_at = now() WHERE id = ${params.id}`;
  }

  return NextResponse.json({ ok: true, saved_at: new Date().toISOString() });
}
