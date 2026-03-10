import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware — guards /dashboard and /admin routes.
 *
 * Firebase Auth tokens live on the client, so we rely on a lightweight
 * `__session` cookie that the AuthProvider sets after login.  The
 * middleware only checks for the cookie's *presence* — actual auth
 * validation happens client-side via Firebase SDK.  This prevents the
 * page from loading at all for logged-out users (no flash of content).
 */

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard protected routes
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const session = request.cookies.get("__session")?.value;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
