"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const navItems = [
  { name: "工作台首页", path: "/" },
  { name: "写作项目", path: "/projects" },
  { name: "新建材料", path: "/generate" },
  { name: "历史材料检索", path: "/search" },
  { name: "参考公文语料", path: "/library" },
];
const publicPaths = ["/login", "/register", "/setup", "/reset-password"];

export default function LayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));
  const [identity, setIdentity] = useState<{ displayName: string; role: string; systemRole: string; departmentName?: string; authMode: string; mustChangePassword?: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (isPublic) return () => controller.abort();
    void fetch("/api/session", { signal: controller.signal }).then((response) => { if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent(pathname)}`); return null; } return response.ok ? response.json() : null; })
      .then((value) => { if (value && typeof value.displayName === "string") setIdentity(value); }).catch(() => undefined);
    return () => controller.abort();
  }, [isPublic, pathname, router]);
  if (isPublic) return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">{children}</main>;
  const visibleNav = identity?.systemRole === "admin" || identity?.systemRole === "super_admin" ? [...navItems, { name: "用户与权限", path: "/admin" }, { name: "系统设置", path: "/settings" }] : navItems;
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
  return <div className="flex min-h-screen">
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 md:flex">
      <div className="border-b border-slate-800 px-5 py-6"><p className="text-sm font-extrabold tracking-wide text-white">公文智能辅助写作</p><p className="mt-1 text-[10px] text-slate-500">历史材料驱动的可信起草</p></div>
      <nav className="flex-1 space-y-1 p-3">{visibleNav.map((item) => <Link key={item.path} href={item.path} className={`block rounded px-4 py-3 text-xs font-semibold transition-colors ${pathname === item.path || (item.path !== "/" && pathname.startsWith(`${item.path}/`)) ? "bg-teal-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{item.name}</Link>)}</nav>
      <div className="border-t border-slate-800 p-4"><Link href="/account" className="block truncate text-[10px] font-semibold text-slate-300 hover:text-white">{identity?.displayName ?? "正在确认身份…"}</Link><p className="mt-1 text-[9px] text-slate-500">{identity?.departmentName ?? "未分配部门"} · {identity?.systemRole ?? "user"}</p><button onClick={logout} className="mt-3 text-[9px] font-semibold text-slate-500 hover:text-white">退出登录</button><p className="mt-3 text-[9px] leading-4 text-slate-600">内部资料仅用于授权范围内的起草工作</p></div>
    </aside>
    <main className="min-w-0 flex-1 bg-slate-50/50"><header className="border-b bg-white px-4 py-3 md:hidden"><div className="flex gap-3 overflow-x-auto">{visibleNav.map((item) => <Link key={item.path} href={item.path} className={`whitespace-nowrap text-xs ${pathname === item.path ? "font-bold text-teal-800" : "text-slate-500"}`}>{item.name}</Link>)}</div></header>{identity?.mustChangePassword && <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-800">为保障账号安全，请前往“个人账户”修改临时密码。</div>}<div className="p-4 sm:p-6 lg:p-8">{children}</div></main>
  </div>;
}
