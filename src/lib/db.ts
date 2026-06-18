import { neon } from "@neondatabase/serverless";

// Neon HTTP driver (NOT a pool). Convention carried over from the EHRC stack.
// Note: with the HTTP driver, GROUP BY-alias issues need a nested subquery.
const url = process.env.DATABASE_URL;
if (!url) {
  // Defer throwing to call sites so build/import doesn't crash without env.
  console.warn("[db] DATABASE_URL is not set");
}

export const sql = neon(url ?? "postgres://invalid");

export function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
