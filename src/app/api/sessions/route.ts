import { NextRequest, NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import type { NoteType } from "@/lib/notes/types";

export const runtime = "nodejs";

const VALID: NoteType[] = ["ot_note", "discharge_summary", "opd_rx"];

/** POST /api/sessions — start a note. Body: { note_type, procedure?, patient_ref?, doctor_id? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const noteType = body.note_type as NoteType;
  if (!VALID.includes(noteType)) {
    return NextResponse.json({ error: "invalid note_type" }, { status: 400 });
  }

  const id = genId("ses");
  await sql`
    INSERT INTO note_sessions (id, doctor_id, patient_ref, note_type, procedure, status)
    VALUES (${id}, ${body.doctor_id ?? null}, ${body.patient_ref ?? null},
            ${noteType}, ${body.procedure ?? null}, 'started')
  `;
  await sql`
    INSERT INTO note_audit (session_id, event, actor, payload)
    VALUES (${id}, 'session_started', ${body.doctor_id ?? "unknown"},
            ${JSON.stringify({ noteType, procedure: body.procedure ?? null })}::jsonb)
  `;

  return NextResponse.json({ id, note_type: noteType, status: "started" });
}
