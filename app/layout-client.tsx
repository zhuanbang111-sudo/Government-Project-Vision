"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { name: "工作台首页", path: "/" },
  { name: "新建材料", path: "/generate" },
  { name: "历史材料检索", path: "/search" },
  { name: "参考公文语料", path: "/library" },
];

export default function LayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="flex min-h-screen">
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 md:flex">
      <div className="border-b border-slate-800 px-5 py-6"><p className="text-sm font-extrabold tracking-wide text-white">公文智能辅助写作</p><p className="mt-1 text-[10px] text-slate-500">历史材料驱动的可信起草</p></div>
      <nav className="flex-1 space-y-1 p-3">{navItems.map((item) => <Link key={item.path} href={item.path} className={`block rounded px-4 py-3 text-xs font-semibold transition-colors ${pathname === item.path ? "bg-teal-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{item.name}</Link>)}</nav>
      <p className="border-t border-slate-800 p-4 text-center text-[10px] text-slate-500">内部资料仅用于授权范围内的起草工作</p>
    </aside>
    <main className="min-w-0 flex-1 bg-slate-50/50"><header className="border-b bg-white px-4 py-3 md:hidden"><div className="flex gap-3 overflow-x-auto">{navItems.map((item) => <Link key={item.path} href={item.path} className={`whitespace-nowrap text-xs ${pathname === item.path ? "font-bold text-teal-800" : "text-slate-500"}`}>{item.name}</Link>)}</div></header><div className="p-4 sm:p-6 lg:p-8">{children}</div></main>
  </div>;
}
