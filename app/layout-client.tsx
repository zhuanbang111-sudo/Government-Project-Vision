"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const navItems = [
  { name: "工作台首页", path: "/" },
  { name: "写作项目", path: "/projects" },
  { name: "新建材料", path: "/generate" },
  { name: "历史材料检索", path: "/search" },
  { name: "参考公文语料", path: "/library" },
  { name: "系统设置", path: "/settings" },
];

export default function LayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<{ displayName: string; role: string; authMode: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/session", { signal: controller.signal }).then((response) => response.ok ? response.json() : null)
      .then((value) => { if (value && typeof value.displayName === "string") setIdentity(value); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return <div className="flex min-h-screen">
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 md:flex">
      <div className="border-b border-slate-800 px-5 py-6"><p className="text-sm font-extrabold tracking-wide text-white">公文智能辅助写作</p><p className="mt-1 text-[10px] text-slate-500">历史材料驱动的可信起草</p></div>
      <nav className="flex-1 space-y-1 p-3">{navItems.map((item) => <Link key={item.path} href={item.path} className={`block rounded px-4 py-3 text-xs font-semibold transition-colors ${pathname === item.path || (item.path !== "/" && pathname.startsWith(`${item.path}/`)) ? "bg-teal-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{item.name}</Link>)}</nav>
      <div className="border-t border-slate-800 p-4"><p className="truncate text-[10px] font-semibold text-slate-300">{identity?.displayName ?? "正在确认身份…"}</p><p className="mt-1 text-[9px] text-slate-500">{identity?.authMode === "cloudflare-access" ? "Cloudflare Access 已验证" : "单人测试兼容模式"}</p><p className="mt-3 text-[9px] leading-4 text-slate-600">内部资料仅用于授权范围内的起草工作</p></div>
    </aside>
    <main className="min-w-0 flex-1 bg-slate-50/50"><header className="border-b bg-white px-4 py-3 md:hidden"><div className="flex gap-3 overflow-x-auto">{navItems.map((item) => <Link key={item.path} href={item.path} className={`whitespace-nowrap text-xs ${pathname === item.path ? "font-bold text-teal-800" : "text-slate-500"}`}>{item.name}</Link>)}</div></header><div className="p-4 sm:p-6 lg:p-8">{children}</div></main>
  </div>;
}
