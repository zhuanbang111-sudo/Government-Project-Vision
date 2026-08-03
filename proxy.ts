import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 放行登录页面本身和 Next.js 静态资源
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 检查浏览器 Cookie 中是否存在授权凭证
  const accessCookie = request.cookies.get("site_access");

  // 如果没有凭证或凭证不正确
  if (!accessCookie || accessCookie.value !== "granted") {
    // 如果是 API 请求，返回 401 状态码，防止后台接口被未授权调用
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未授权的访问" }, { status: 401 });
    }
    // 如果是普通页面请求，重定向到登录页
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// 匹配除了静态资源之外的所有路由
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};