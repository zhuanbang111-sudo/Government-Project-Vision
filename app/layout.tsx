import type { Metadata } from "next";
import "./globals.css";
import LayoutClient from "./layout-client";

export const metadata: Metadata = {
  title: "公文智能协作工作台",
  description: "基于大模型与本地语料库的合规智能拟稿辅助系统",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh" className="h-full">
      <body className="h-full antialiased text-slate-800">
        {/* 引入客户端导航布局包装器 */}
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}