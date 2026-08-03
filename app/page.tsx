"use client";

import { ChangeEvent, useState } from "react";
import Link from "next/link";
import { theme } from "./ui-config";

type Stats = { docCount: number; genCount: number };
type UploadResult = { successCount: number; failCount: number; details: Array<{ filename: string; status: string; message: string }> };

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({ docCount: 0, genCount: 0 });
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    const response = await fetch("/api/stats");
    if (response.ok) setStats(await response.json() as Stats);
  };
  const upload = async () => {
    if (!files?.length) { setError("请先选择参考公文文件。"); return; }
    setUploading(true); setError(null); setResult(null);
    const form = new FormData();
    form.append("libraryType", "语料库");
    for (const file of files) form.append("files", file);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const payload = await response.json() as UploadResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "上传失败");
      setResult(payload); await loadStats();
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "上传失败"); }
    finally { setUploading(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <section className={`${theme.card} bg-gradient-to-r from-teal-900 to-slate-900 border-none p-8 text-white`}>
      <h1 className="text-2xl font-bold">政府材料智能编制平台</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-100">以参考公文语料为基础，支持任务分析、知识匹配、协同起草与合规审查。</p>
    </section>

    <section className={`${theme.card} p-6`}>
      <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-800">参考公文语料上传</h2><Link href="/library" className="text-xs font-semibold text-teal-800 hover:underline">进入知识资产中心 →</Link></div>
      <p className="mb-4 text-xs text-slate-500">上传 DOCX 参考公文，系统将提取正文并沉淀为写作检索资料。</p>
      <input type="file" multiple accept=".docx" onChange={(event: ChangeEvent<HTMLInputElement>) => setFiles(event.target.files)} className="block w-full text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-teal-800" />
      <button onClick={upload} disabled={uploading} className={`${theme.primaryBtn} mt-4 disabled:cursor-not-allowed disabled:opacity-60`}>{uploading ? "正在上传…" : "上传参考公文"}</button>
      {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
      {result && <p className="mt-3 text-xs text-emerald-700">成功 {result.successCount} 份，失败 {result.failCount} 份。</p>}
    </section>

    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className={theme.card}><p className={theme.muted}>本地参考公文</p><p className="mt-2 text-2xl font-extrabold text-slate-800">{stats.docCount}</p></div>
      <div className={theme.card}><p className={theme.muted}>已归档生成稿</p><p className="mt-2 text-2xl font-extrabold text-slate-800">{stats.genCount}</p></div>
    </section>
    <section className={`${theme.card} flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center`}><div><h2 className="font-bold text-slate-800">引导式智能写作</h2><p className="mt-1 text-xs text-slate-500">定义任务、确认资料、生成草稿并执行合规审查。</p></div><Link href="/generate" className={theme.primaryBtn}>启动写作流程</Link></section>
  </div>;
}
