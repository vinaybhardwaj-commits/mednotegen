import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

/**
 * Protected migration: runs db/schema.sql then db/seed/nabh_requirements_seed.sql.
 * Guard with header `x-migration-secret: $MIGRATION_SECRET`. POST only (GET no-ops).
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-migration-secret") !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "DATABASE_URL unset" }, { status: 500 });

  const sql = neon(url);
  const root = process.cwd();
  const files = ["db/schema.sql", "db/seed/nabh_requirements_seed.sql"];
  const ran: Record<string, number> = {};

  for (const f of files) {
    const text = await readFile(path.join(root, f), "utf8");
    const statements = splitSql(text);
    for (const stmt of statements) {
      await sql.query(stmt);
    }
    ran[f] = statements.length;
  }

  return NextResponse.json({ ok: true, ran });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST with x-migration-secret to run." });
}

/** Strip line comments and split into statements on semicolons. */
function splitSql(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
