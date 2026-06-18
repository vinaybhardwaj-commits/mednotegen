import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const maxDuration = 60;

// neon() has no .query() in this version; run raw strings via the tagged-template form.
type RawSql = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

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

  const sql = neon(url) as unknown as RawSql;
  const root = process.cwd();
  const files = ["db/schema.sql", "db/seed/nabh_requirements_seed.sql"];
  const ran: Record<string, number> = {};

  try {
    for (const f of files) {
      const text = await readFile(path.join(root, f), "utf8");
      const statements = splitSql(text);
      for (const raw of statements) {
        // make seed inserts idempotent so the migration can be re-run safely
        const stmt = /^INSERT INTO/i.test(raw) && !/ON CONFLICT/i.test(raw)
          ? raw + " ON CONFLICT DO NOTHING"
          : raw;
        const tsa = Object.assign([stmt], { raw: [stmt] }) as unknown as TemplateStringsArray;
        await sql(tsa);
      }
      ran[f] = statements.length;
    }
  } catch (e) {
    return NextResponse.json({ error: String(e), ran }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ran });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST with x-migration-secret to run." });
}

/**
 * Split SQL into statements on semicolons, while ignoring semicolons inside
 * single-quoted string literals and `--` line comments. Comments are dropped.
 */
function splitSql(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (n === "'") { cur += n; i++; } // escaped '' inside a string
        else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "-" && n === "-") { // line comment → skip to EOL
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === ";") { const s = cur.trim(); if (s) out.push(s); cur = ""; continue; }
    cur += c;
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}
