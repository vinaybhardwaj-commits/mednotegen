import { NextRequest, NextResponse } from "next/server";

/**
 * Token gate for the whole app (?t=...). The migrate route is protected
 * separately by MIGRATION_SECRET, so it is exempted here.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Exempt: migrate route (own secret), static assets.
  if (pathname.startsWith("/api/migrate")) return NextResponse.next();

  const expected = process.env.APP_ACCESS_TOKEN;
  const token = searchParams.get("t") ?? req.headers.get("x-app-token");
  if (expected && token === expected) return NextResponse.next();

  return new NextResponse("Forbidden — append ?t=<token>", { status: 403 });
}

export const config = {
  // Gate pages + APIs, skip Next internals and favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
