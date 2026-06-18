import { NextRequest } from "next/server";

/**
 * Simple token gate (?t=... or x-app-token header), like evenos-revenue / evenos-status.
 * Prototype-grade access control; replaced by JWT-cookie + roles when productionized.
 */
export function isAllowed(req: NextRequest): boolean {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) return false;
  const t = req.nextUrl.searchParams.get("t") ?? req.headers.get("x-app-token");
  return t === expected;
}
