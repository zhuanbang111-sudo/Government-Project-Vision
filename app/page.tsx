"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { theme } from "./ui-config";

interface Stats {
  docCount: number;
  funcCount: number;
  genCount: number;
}

interface UploadResult {
  successCount: number;
  skipCount: number;
  failCount: number;
  details: { filename: string; status: string; message: string }[];
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({ docCount: 0, funcCount: 0, genCount: 0 });

  // 针对三个独立上传区的加载与结果状态
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<Record<string, UploadResult>>({});
  
  // 选中的文件暂存
  const [selectedFiles, setSelectedFiles] = useState<Record<string, FileList | null>>({});

  const fetchStats = () => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // 处理网页直接上传核心动作
  const handleDirectUpload = async (libraryType: string) => {
    const files = selectedFiles[libraryType];
    if (!files || files.length === 0) {
      alert("请先选择至少一个要上传的文件！");
      return;
    }

    setUploadingType(libraryType);
    const formData = new FormData();
    formData.append("libraryType", libraryType);
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传处理失败");

      setUploadResults((prev) => ({ ...prev, [libraryType]: data }));
      // 上传成功后立即触发统计栏刷新
      fetchStats();
    } catch (err: any) {
      alert(`上传出错: ${err.message}`);
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* 欢迎引导面板 */}
      <div className={`${theme.card} relative overflow-hidden bg-linear-to-r from-teal-900 to-slate-900 border-none text-white p-8 rounded`}>
        <div className="relative z-10 max-w-xl space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold">欢迎进入政府材料智能编制平台</h2>
          <p className="text-xs text-teal-100 leading-relaxed">
            本平台深度集成统一知识资产管理。支持智能匹配政策依据、核心事实指标、部门业务职责及标准公文范本，在起草过程中严格约束幻觉，全面提升行政行文合规化与高水准编制。
          </p>
        </div>
        <div className="absolute right-0 bottom-0 opacity-10 text-9xl select-none pointer-events-none p-4">🏛️</div>
      </div>

      {/* 核心容量摘要统计栏 */}
      <div className={`${theme.card} p-4 flex flex-col sm:flex-row justify-between items-center bg-white border-l-4 border-l-teal-800 shadow-sm`}>
        <div className="flex items-center space-x-3">
          <span className="text-2xl">📈</span>
          <div>
            <h3 className="text-xs font-bold text-slate-800">
              知识资产库当前共收录 <span className="text-teal-800 font-extrabold">{stats.docCount}</span> 篇高价值编制素材
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">多维知识深度融合，支持在公文起草中自动检索政策、数据、职责与优秀案例。</p>
          </div>
        </div>
        <Link href="/library" className="mt-3 sm:mt-0 text-xs font-semibold text-teal-800 hover:underline whitespace-nowrap">
          进入知识资产中心 ➔
        </Link>
      </div>

      {/* 📂 本地语料自动化导入指引与网页直接上传面板 */}
      <div className={`${theme.card} p-6 border border-slate-200 bg-amber-50/10`}>
        <h3 className="text-xs font-bold text-slate-800 flex items-center mb-4 uppercase tracking-wider">
          <span>📂 知识资产极速录入通道（支持批量上传并自动分类）</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 板块 1：参考公文库 */}
          <div className="bg-white p-4 rounded border border-slate-200 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <p className="font-bold text-blue-800 text-xs">1. 参考公文语料</p>
              <p className="text-gray-400 text-[10px]">自动分类为 document / 支持多选</p>
              <code className="block bg-slate-50 border rounded px-1.5 py-0.5 text-[9px] text-gray-500 font-mono">分类：参考公文语料</code>
            </div>
            <div className="space-y-2 pt-2 border-t border-dashed">
              <input
                type="file"
                multiple
                accept=".docx,.pdf"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedFiles((prev) => ({ ...prev, "语料库": e.target.files }))}
                className="block w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-blue-50 file:text-blue-700"
              />
              <button
                onClick={() => handleDirectUpload("语料库")}
                disabled={uploadingType === "语料库"}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-[11px] font-semibold transition-colors"
              >
                {uploadingType === "语料库" ? "分析沉淀中..." : "上传并归档资产"}
              </button>
            </div>
            {uploadResults["语料库"] && (
              <div className="p-2 bg-slate-50 rounded text-[10px] text-slate-600 space-y-1">
                <p className="font-bold text-emerald-700">成功: {uploadResults["语料库"].successCount} | 失败: {uploadResults["语料库"].failCount}</p>
              </div>
            )}
          </div>

          {/* 板块 2：事实数据指标库 */}
          <div className="bg-white p-4 rounded border border-slate-200 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <p className="font-bold text-purple-800 text-xs">2. 事实数据指标</p>
              <p className="text-gray-400 text-[10px]">自动分类为 fact / 杜绝数字幻觉</p>
              <code className="block bg-slate-50 border rounded px-1.5 py-0.5 text-[9px] text-gray-500 font-mono">分类：事实数据指标</code>
            </div>
            <div className="space-y-2 pt-2 border-t border-dashed">
              <input
                type="file"
                multiple
                accept=".docx,.pdf"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedFiles((prev) => ({ ...prev, "统计数据库": e.target.files }))}
                className="block w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-purple-50 file:text-purple-700"
              />
              <button
                onClick={() => handleDirectUpload("统计数据库")}
                disabled={uploadingType === "统计数据库"}
                className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded text-[11px] font-semibold transition-colors"
              >
                {uploadingType === "统计数据库" ? "指标提取中..." : "上传并归档资产"}
              </button>
            </div>
            {uploadResults["统计数据库"] && (
              <div className="p-2 bg-slate-50 rounded text-[10px] text-slate-600 space-y-1">
                <p className="font-bold text-emerald-700">成功: {uploadResults["统计数据库"].successCount} | 失败: {uploadResults["统计数据库"].failCount}</p>
              </div>
            )}
          </div>

        </div>

        <p className="text-[10px] text-slate-400 mt-4 border-t pt-2 border-dashed border-slate-200">
          * 您也可以进入 【知识资产中心】 页面，进行包含“政策法规”、“标准模板”、“实践案例”在内的更多全要素知识资产的导入与深度匹配。
        </p>
      </div>

      {/* 核心指标统计卡片 */}
      <div className="grid grid-cols-1 gap-4">
        <div className={`${theme.card} p-5 flex flex-col justify-between`}>
          <span className={theme.muted}>本地参考公文总库</span>
          <div className="flex items-baseline space-x-1.5 mt-2">
            <span className="text-2xl font-extrabold text-slate-800">{stats.docCount}</span>
            <span className="text-xs text-gray-400">篇</span>
          </div>
        </div>
        <div className={`${theme.card} p-5 flex flex-col justify-between`}>
          <span className={theme.muted}>已归档高价值资产</span>
          <div className="flex items-baseline space-x-1.5 mt-2">
            <span className="text-2xl font-extrabold text-slate-800">{stats.genCount}</span>
            <span className="text-xs text-gray-400">个</span>
          </div>
        </div>
      </div>

      {/* 智能引导写作核心主入口 */}
      <div className={`${theme.card} hover:border-teal-700/40 transition-colors`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">💡 引导式智能拟文工作流 (核心)</h3>
            <p className="text-xs text-gray-400">深度融合自动知识匹配框架，杜绝常识幻觉，自动生成高契合度政府材料草案。</p>
          </div>
          <Link href="/generate" className={theme.primaryBtn}>
            立即启动拟写流程
          </Link>
        </div>
      </div>

      {/* 辅助板块快速入口 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={theme.card}>
          <h4 className="text-sm font-bold text-slate-800 mb-1">🔍 语义检索工具</h4>
          <p className="text-xs text-gray-400 leading-relaxed mb-4">通过自然语言描述跨词义检索本地统一知识资产库历史存档。</p>
          <Link href="/search" className="text-xs font-semibold text-teal-800 hover:underline">开始检索 ➔</Link>
        </div>
        <div className={theme.card}>
          <h4 className="text-sm font-bold text-slate-800 mb-1">🏢 处室职责标准</h4>
          <p className="text-xs text-gray-400 leading-relaxed mb-4">一键导入或查看由 Excel 提取的各处室定岗定责权责边界表。</p>
          <Link href="/departments" className="text-xs font-semibold text-teal-800 hover:underline">查看权责 ➔</Link>
        </div>
      </div>
    </div>
  );
}
