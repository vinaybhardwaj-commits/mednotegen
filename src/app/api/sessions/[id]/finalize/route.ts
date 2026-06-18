import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/sessions/:id/finalize — sign & lock.
 * Body: { note_id, final_md, signed_by }. Human signature is mandatory.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const { note_id, final_md, signed_by } = body;
  if (!note_id || !final_md || !signed_by) {
    return NextResponse.json({ error: "note_id, final_md and signed_by are required" }, { status: 400 });
  }

  await sql`
    UPDATE generated_notes
    SET final_md = ${final_md}, signed_by = ${signed_by}, signed_at = now()
    WHERE id = ${note_id} AND session_id = ${params.id}
  `;
  await sql`UPDATE note_sessions SET status = 'signed', updated_at = now() WHERE id = ${params.id}`;
  await sql`
    INSERT INTO note_audit (session_id, event, actor, payload)
    VALUES (${params.id}, 'note_signed', ${signed_by}, ${JSON.stringify({ note_id })}::jsonb)
  `;

  return NextResponse.json({ ok: true, note_id, status: "signed" });
}
