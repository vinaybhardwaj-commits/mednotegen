import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/sessions/:id/answers — upsert answers (autosave).
 * Body: { answers: [{ field_key, value, source?, na_reason? }] }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!answers.length) return NextResponse.json({ error: "no answers" }, { status: 400 });

  for (const a of answers) {
    if (!a.field_key) continue;
    await sql`
      INSERT INTO note_answers (session_id, field_key, value, source, na_reason, updated_at)
      VALUES (${params.id}, ${a.field_key}, ${a.value ?? null},
              ${a.source ?? "typed"}, ${a.na_reason ?? null}, now())
      ON CONFLICT (session_id, field_key)
      DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source,
                    na_reason = EXCLUDED.na_reason, updated_at = now()
    `;
  }

  await sql`UPDATE note_sessions SET updated_at = now() WHERE id = ${params.id}`;
  return NextResponse.json({ ok: true, saved: answers.length });
}
