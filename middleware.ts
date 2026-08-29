import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "gp_session";
const publicPages = ["/login", "/register", "/setup", "/reset-password"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/") || publicPages.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE) || request.headers.has("cf-access-authenticated-user-email")) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
