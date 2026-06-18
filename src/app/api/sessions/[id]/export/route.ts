import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { toDocx } from "@/lib/notes/export-docx";

export const runtime = "nodejs";

/** GET /api/sessions/:id/export?format=docx — export the signed (or draft) note. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const format = req.nextUrl.searchParams.get("format") ?? "docx";

  const rows = (await sql`
    SELECT g.final_md, g.draft_md, s.patient_ref, s.note_type
    FROM generated_notes g JOIN note_sessions s ON s.id = g.session_id
    WHERE g.session_id = ${params.id}
    ORDER BY g.created_at DESC LIMIT 1
  `) as any[];
  if (!rows.length) return NextResponse.json({ error: "no note for session" }, { status: 404 });

  const md = rows[0].final_md ?? rows[0].draft_md ?? "";
  if (format === "md") {
    return new NextResponse(md, { headers: { "content-type": "text/markdown" } });
  }
  if (format !== "docx") {
    return NextResponse.json({ error: "format must be docx or md" }, { status: 400 });
  }

  const TITLES: Record<string, string> = {
    ot_note: "Operative Note",
    discharge_summary: "Discharge Summary",
    opd_rx: "Prescription",
  };
  const title = TITLES[rows[0].note_type as string] ?? "Clinical Note";
  const buf = await toDocx(md, { title, uhid: rows[0].patient_ref ?? "" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="note-${params.id}.docx"`,
    },
  });
}
