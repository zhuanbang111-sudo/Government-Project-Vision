"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { theme } from "../../ui-config";

type Version = { id: number; version_number: number; stage: string; content: string; created_at: string };
type ProjectDocument = { id: number; filename: string; document_type: string; department: string; verification_status: string; selected_passages: string };
type ProjectDetail = {
  project?: { id: string; title: string; document_type: string; status: string; owner_name: string; created_at: string; updated_at: string };
  versions?: Version[];
  documents?: ProjectDocument[];
  exports?: Array<{ id: string; filename: string; file_size: number; created_at: string }>;
  activities?: Array<{ action: string; actor_name: string; created_at: string }>;
  error?: string;
};

const stageLabel: Record<string, string> = { ai_draft: "AI初稿", edited: "人工修改稿", reviewed: "审核稿", final: "最终稿" };

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/projects/${params.id}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as ProjectDetail;
      if (!response.ok) throw new Error(payload.error || "项目加载失败");
      setData(payload);
    }).catch((caught: unknown) => { if (!(caught instanceof DOMException)) setError(caught instanceof Error ? caught.message : "项目加载失败"); });
    return () => controller.abort();
  }, [params.id]);
  if (error) return <div className="mx-auto max-w-5xl rounded border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>;
  if (!data?.project) return <div className="mx-auto max-w-5xl py-16 text-center text-xs text-slate-400">正在读取完整档案…</div>;
  return <div className="mx-auto max-w-6xl space-y-6">
    <header><Link href="/projects" className="text-xs text-teal-700 hover:underline">← 返回项目列表</Link><div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold text-teal-700">{data.project.document_type}</p><h1 className={`${theme.title} mt-1`}>{data.project.title}</h1><p className="mt-2 text-[10px] text-slate-400">负责人：{data.project.owner_name}｜更新于 {new Date(data.project.updated_at).toLocaleString("zh-CN")}</p></div><Link href="/generate" className={theme.secondaryBtn}>基于档案新建材料</Link></div></header>
    <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className={`${theme.card} space-y-4`}><h2 className="font-bold text-slate-800">项目资料包</h2>{data.documents?.length ? data.documents.map((document) => <div key={document.id} className="rounded border border-slate-100 p-3"><p className="text-xs font-semibold text-slate-700">{document.filename}</p><p className="mt-1 text-[9px] text-slate-400">{document.department || "未分类"}｜{document.verification_status === "verified" ? "已核验" : "待核验"}｜已选 {JSON.parse(document.selected_passages || "[]").length} 个片段</p></div>) : <p className="text-xs text-slate-400">尚未关联历史语料。</p>}</div>
      <div className={`${theme.card} space-y-4`}><h2 className="font-bold text-slate-800">文稿版本</h2>{data.versions?.length ? data.versions.map((version) => <details key={version.id} className="rounded border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">V{version.version_number} · {stageLabel[version.stage] ?? version.stage}<span className="ml-2 text-[9px] font-normal text-slate-400">{new Date(version.created_at).toLocaleString("zh-CN")}</span></summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap border-t pt-3 font-sans text-[11px] leading-5 text-slate-600">{version.content}</pre></details>) : <p className="text-xs text-slate-400">尚未形成文稿版本。</p>}</div>
    </section>
    <section className={`${theme.card}`}><h2 className="font-bold text-slate-800">操作记录</h2><div className="mt-4 space-y-2">{data.activities?.length ? data.activities.map((activity, index) => <div key={`${activity.created_at}-${index}`} className="flex justify-between border-b border-slate-50 py-2 text-[10px]"><span className="text-slate-600">{activity.actor_name} · {activity.action}</span><span className="text-slate-400">{new Date(activity.created_at).toLocaleString("zh-CN")}</span></div>) : <p className="text-xs text-slate-400">暂无操作记录。</p>}</div></section>
    {data.exports?.length ? <section className={`${theme.card}`}><h2 className="font-bold text-slate-800">归档 DOCX</h2><div className="mt-4 space-y-2">{data.exports.map((item) => <a key={item.id} href={`/api/projects/${params.id}/exports/${item.id}`} className="flex items-center justify-between rounded border border-slate-100 p-3 text-xs hover:border-teal-200 hover:bg-teal-50/30"><span className="font-semibold text-slate-700">{item.filename}</span><span className="text-[9px] text-teal-700">下载 · {Math.max(1, Math.round(item.file_size / 1024))} KB</span></a>)}</div></section> : null}
  </div>;
}
