import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { composeFromText } from "@/lib/notes/composer";
import type { NoteType } from "@/lib/notes/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/sessions/:id/compose  (R5)
 * Body: { text } — the current editor content.
 * Reformats the doctor's free text into a clean NABH-organised note (markdown), in place.
 * Grounding: composes ONLY from the provided text (no invented facts).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (text.length < 8) return NextResponse.json({ error: "not enough to compose" }, { status: 400 });

  const rows = (await sql`SELECT note_type FROM note_sessions WHERE id = ${params.id} LIMIT 1`) as any[];
  if (!rows.length) return NextResponse.json({ error: "session not found" }, { status: 404 });

  try {
    const composed = await composeFromText(rows[0].note_type as NoteType, text);
    await sql`
      INSERT INTO note_audit (session_id, event, actor, payload)
      VALUES (${params.id}, 'composed', 'doctor', ${JSON.stringify({ in_len: text.length, out_len: composed.length })}::jsonb)
    `;
    return NextResponse.json({ composed_md: composed });
  } catch (e) {
    console.error("[compose] failed", e);
    return NextResponse.json({ error: "compose_failed", detail: String(e) }, { status: 502 });
  }
}
