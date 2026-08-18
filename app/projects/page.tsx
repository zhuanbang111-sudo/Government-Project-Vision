"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { theme } from "../ui-config";

type Project = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  owner_name: string;
  document_count: number;
  version_count: number;
  latest_stage?: string | null;
  updated_at: string;
};

const statusLabels: Record<string, string> = {
  planning: "任务规划", materials: "语料配置", drafting: "起草中", review: "审核中", completed: "已完成", archived: "已归档",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/projects", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { projects?: Project[]; error?: string };
      if (!response.ok) throw new Error(data.error || "项目加载失败");
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    }).catch((caught: unknown) => { if (!(caught instanceof DOMException)) setError(caught instanceof Error ? caught.message : "项目加载失败"); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const archive = async (project: Project) => {
    if (!window.confirm(`确认归档“${project.title}”？归档后数据仍可恢复。`)) return;
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (response.ok) setProjects((current) => current.filter((item) => item.id !== project.id));
    else setError("归档失败，请稍后重试");
  };
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold text-teal-700">材料项目与版本档案</p><h1 className={`${theme.title} mt-2`}>写作项目</h1><p className="mt-2 text-xs text-slate-500">每项任务集中保留语料、提纲、草稿、审核版本和最终导出文件。</p></div><Link href="/generate" className={theme.primaryBtn}>新建写作项目</Link></header>
    {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {loading ? <div className={`${theme.card} text-center text-xs text-slate-400`}>正在读取项目档案…</div> : projects.length === 0 ? <section className={`${theme.card} py-14 text-center`}><h2 className="font-semibold text-slate-700">还没有写作项目</h2><p className="mt-2 text-xs text-slate-400">从“新建材料”开始，系统会自动建立项目并保存全过程。</p><Link href="/generate" className={`${theme.primaryBtn} mt-5 inline-block`}>开始第一份材料</Link></section> : <section className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => <article key={project.id} className={`${theme.card} space-y-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold text-teal-700">{project.document_type}</p><Link href={`/projects/${project.id}`} className="mt-1 block font-bold text-slate-800 hover:text-teal-800">{project.title}</Link></div><span className="rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-600">{statusLabels[project.status] ?? project.status}</span></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded bg-slate-50 p-2"><p className="text-sm font-bold">{project.document_count}</p><p className="text-[9px] text-slate-400">参考文件</p></div><div className="rounded bg-slate-50 p-2"><p className="text-sm font-bold">{project.version_count}</p><p className="text-[9px] text-slate-400">文稿版本</p></div><div className="rounded bg-slate-50 p-2"><p className="truncate text-[10px] font-semibold">{project.owner_name}</p><p className="text-[9px] text-slate-400">负责人</p></div></div><div className="flex items-center justify-between border-t pt-3 text-[9px] text-slate-400"><span>更新于 {new Date(project.updated_at).toLocaleString("zh-CN")}</span><button onClick={() => archive(project)} className="text-slate-400 hover:text-red-600">归档</button></div></article>)}
    </section>}
  </div>;
}
