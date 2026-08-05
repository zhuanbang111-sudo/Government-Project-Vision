import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// OpenNext supports Edge Middleware. Keep access control entirely on Web APIs so
// it can run in Cloudflare Workers without a Node.js middleware runtime.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();
  const accessCookie = request.cookies.get("site_access");
  if (!accessCookie || accessCookie.value !== "granted") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "未授权的访问" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"] };
