import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/sessions/:id/expansions  (R4)
 * Body: { from, to } — log an accepted rewrite/expansion so a curated EHRC
 * abbreviation lexicon accrues for later deterministic hardening.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const from = String(body.from ?? "").trim();
  const to = String(body.to ?? "").trim();
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const rows = (await sql`SELECT note_type FROM note_sessions WHERE id = ${params.id} LIMIT 1`) as any[];
  const noteType = rows.length ? rows[0].note_type : null;

  await sql`
    INSERT INTO expansion_log (session_id, note_type, from_text, to_text)
    VALUES (${params.id}, ${noteType}, ${from}, ${to})
  `;
  return NextResponse.json({ ok: true });
}
