import { neon } from "@neondatabase/serverless";

// Neon HTTP driver (NOT a pool). Convention carried over from the EHRC stack.
// Note: with the HTTP driver, GROUP BY-alias issues need a nested subquery.
const url = process.env.DATABASE_URL;
if (!url) {
  // Use a well-formed placeholder so neon() construction doesn't throw at build/import
  // time (it validates URL format). Real DATABASE_URL is injected at runtime.
  console.warn("[db] DATABASE_URL is not set — using build-time placeholder");
}

export const sql = neon(url ?? "postgresql://user:password@localhost/db");

export function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
