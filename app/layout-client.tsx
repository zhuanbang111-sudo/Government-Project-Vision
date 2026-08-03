"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function LayoutClient({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  // 定义左侧系统固定菜单
  const navItems = [
    { name: "🏠 工作台首页", path: "/" },
    { name: "💡 引导写作向导", path: "/generate" },
    { name: "🔍 公文语义搜索", path: "/search" },
    { name: "📚 语料元数据", path: "/library" },
    { name: "🏢 部门职能库", path: "/departments" },
  ];

  return (
    <div className="h-full flex flex-col md:flex-row min-h-screen">
      
      {/* 1. 左侧权威导航侧边栏 */}
      <aside className="hidden md:flex flex-col w-60 bg-slate-900 text-slate-300 border-r border-slate-800 h-screen sticky top-0">
        <div className="p-5 border-b border-slate-800 flex items-center space-x-2.5">
          <span className="text-lg">🏛️</span>
          <span className="font-extrabold text-white text-sm tracking-wide">公文智能辅助写作</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center px-4 py-3 text-xs font-semibold rounded transition-colors ${
                  isActive ? "bg-teal-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-center text-[10px] text-slate-500">
          机密办公系统内网专线已加密
        </div>
      </aside>

      {/* 2. 右侧主体渲染区 */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
        
        {/* 移动端顶栏适配 */}
        <header className="md:hidden bg-slate-900 text-white p-4 flex flex-col gap-2 z-30 shadow-md">
          <span className="font-bold text-xs">🏛️ 公文智能写作工作台</span>
          <div className="flex flex-wrap gap-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`px-2 py-1 rounded text-[10px] font-semibold ${
                    isActive ? "bg-teal-800 text-white" : "text-slate-400 bg-slate-800"
                  }`}
                >
                  {item.name.replace(/^[^\s]+\s+/, "")}
                </Link>
              );
            })}
          </div>
        </header>

        {/* 页面注入槽 */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}