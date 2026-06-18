import { NextRequest, NextResponse } from "next/server";
import { loadFloor } from "@/lib/notes/nabh-gate";
import type { NoteType } from "@/lib/notes/types";

export const runtime = "nodejs";

const VALID: NoteType[] = ["ot_note", "discharge_summary", "opd_rx"];

/** GET /api/nabh-requirements?note_type=ot_note — the deterministic NABH floor. */
export async function GET(req: NextRequest) {
  const nt = req.nextUrl.searchParams.get("note_type") as NoteType | null;
  if (!nt || !VALID.includes(nt)) {
    return NextResponse.json({ error: "note_type must be one of " + VALID.join(", ") }, { status: 400 });
  }
  const floor = await loadFloor(nt);
  return NextResponse.json({ note_type: nt, count: floor.length, fields: floor });
}
