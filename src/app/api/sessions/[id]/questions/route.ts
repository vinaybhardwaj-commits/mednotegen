import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateSchema } from "@/lib/notes/question-engine";
import type { NoteType } from "@/lib/notes/types";

export const runtime = "nodejs";

/** POST /api/sessions/:id/questions — generate (or fetch cached) the question schema. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const rows = (await sql`
    SELECT note_type, procedure FROM note_sessions WHERE id = ${params.id} LIMIT 1
  `) as any[];
  if (!rows.length) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const schema = await generateSchema(rows[0].note_type as NoteType, rows[0].procedure ?? "");
  await sql`UPDATE note_sessions SET status = 'answering', updated_at = now() WHERE id = ${params.id}`;

  return NextResponse.json({
    session_id: params.id,
    floor_count: schema.fields.filter((f) => f.nabh).length,
    total_count: schema.fields.length,
    fields: schema.fields,
  });
}
