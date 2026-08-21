"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { theme } from "../ui-config";

type ProjectView = "active" | "completed" | "archived";
type Project = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  owner_name: string;
  document_count: number;
  version_count: number;
  export_count: number;
  latest_export_id?: string | null;
  latest_stage?: string | null;
  updated_at: string;
  archived_at?: string | null;
};
type Counts = Record<ProjectView, number>;

const statusLabels: Record<string, string> = {
  planning: "任务规划", materials: "语料配置", drafting: "起草中", review: "审核中", completed: "已完成", archived: "已归档",
};
const views: Array<{ id: ProjectView; label: string; description: string }> = [
  { id: "active", label: "进行中", description: "规划、起草和审核中的材料" },
  { id: "completed", label: "已完成", description: "已审核定稿、仍可继续使用的材料" },
  { id: "archived", label: "已归档", description: "长期保存的只读项目档案" },
];

export default function ProjectsPage() {
  const [view, setView] = useState<ProjectView>("active");
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Counts>({ active: 0, completed: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = async (selectedView: ProjectView, signal?: AbortSignal) => {
    const response = await fetch(`/api/projects?view=${selectedView}`, { cache: "no-store", signal });
    const data = await response.json() as { projects?: Project[]; counts?: Partial<Counts>; error?: string };
    if (!response.ok) throw new Error(data.error || "项目加载失败");
    setProjects(Array.isArray(data.projects) ? data.projects : []);
    setCounts({ active: Number(data.counts?.active) || 0, completed: Number(data.counts?.completed) || 0, archived: Number(data.counts?.archived) || 0 });
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/projects?view=${view}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { projects?: Project[]; counts?: Partial<Counts>; error?: string };
      if (!response.ok) throw new Error(data.error || "项目加载失败");
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setCounts({ active: Number(data.counts?.active) || 0, completed: Number(data.counts?.completed) || 0, archived: Number(data.counts?.archived) || 0 });
    })
      .catch((caught: unknown) => { if (!(caught instanceof DOMException)) setError(caught instanceof Error ? caught.message : "项目加载失败"); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [view]);

  const archive = async (project: Project) => {
    if (!window.confirm(`确认归档“${project.title}”？项目将转为只读，后续仍可恢复。`)) return;
    setBusyId(project.id); setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "归档失败");
      await loadProjects(view);
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "归档失败"); }
    finally { setBusyId(null); }
  };

  const restore = async (project: Project) => {
    setBusyId(project.id); setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "恢复失败");
      await loadProjects("archived");
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "恢复失败"); }
    finally { setBusyId(null); }
  };

  const duplicate = async (project: Project) => {
    setBusyId(project.id); setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "新项目创建失败");
      window.location.assign(`/generate?projectId=${encodeURIComponent(data.id)}`);
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "新项目创建失败"); setBusyId(null); }
  };

  const selectedView = views.find((item) => item.id === view) ?? views[0];
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold text-teal-700">材料项目与版本档案</p><h1 className={`${theme.title} mt-2`}>写作项目</h1><p className="mt-2 text-xs text-slate-500">每项任务集中保留语料、提纲、草稿、审核记录和最终导出文件。</p></div><Link href="/generate" className={theme.primaryBtn}>新建写作项目</Link></header>

    <nav aria-label="项目档案分类" className="grid gap-2 sm:grid-cols-3">
      {views.map((item) => <button key={item.id} type="button" onClick={() => { if (item.id === view) return; setLoading(true); setError(null); setView(item.id); }} aria-current={view === item.id ? "page" : undefined} className={`rounded border p-4 text-left transition ${view === item.id ? "border-teal-700 bg-teal-50/70 shadow-sm" : "border-slate-200 bg-white hover:border-teal-200"}`}><span className="flex items-center justify-between"><span className={`text-sm font-bold ${view === item.id ? "text-teal-800" : "text-slate-700"}`}>{item.label}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">{counts[item.id]}</span></span><span className="mt-1 block text-[10px] text-slate-400">{item.description}</span></button>)}
    </nav>

    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {loading ? <div className={`${theme.card} text-center text-xs text-slate-400`}>正在读取项目档案…</div> : projects.length === 0 ? <section className={`${theme.card} py-14 text-center`}><h2 className="font-semibold text-slate-700">暂无{selectedView.label}项目</h2><p className="mt-2 text-xs text-slate-400">{view === "archived" ? "归档后的项目会显示在这里，并可随时查看或恢复。" : view === "completed" ? "材料审核通过后会进入已完成列表。" : "从“新建材料”开始，系统会自动建立项目并保存全过程。"}</p>{view === "active" && <Link href="/generate" className={`${theme.primaryBtn} mt-5 inline-block`}>开始第一份材料</Link>}</section> : <section className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => <article key={project.id} className={`${theme.card} space-y-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold text-teal-700">{project.document_type}</p><Link href={`/projects/${project.id}`} className="mt-1 block font-bold text-slate-800 hover:text-teal-800">{project.title}</Link></div><span className="rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-600">{statusLabels[project.status] ?? project.status}</span></div><div className="grid grid-cols-4 gap-2 text-center"><div className="rounded bg-slate-50 p-2"><p className="text-sm font-bold">{project.document_count}</p><p className="text-[9px] text-slate-400">参考文件</p></div><div className="rounded bg-slate-50 p-2"><p className="text-sm font-bold">{project.version_count}</p><p className="text-[9px] text-slate-400">文稿版本</p></div><div className="rounded bg-slate-50 p-2"><p className="text-sm font-bold">{project.export_count}</p><p className="text-[9px] text-slate-400">DOCX</p></div><div className="rounded bg-slate-50 p-2"><p className="truncate text-[10px] font-semibold">{project.owner_name}</p><p className="text-[9px] text-slate-400">负责人</p></div></div><div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[9px] text-slate-400"><span>{view === "archived" && project.archived_at ? `归档于 ${new Date(project.archived_at).toLocaleString("zh-CN")}` : `更新于 ${new Date(project.updated_at).toLocaleString("zh-CN")}`}</span><span className="flex items-center gap-3"><Link href={`/projects/${project.id}`} className="font-semibold text-teal-700 hover:underline">查看档案</Link>{project.latest_export_id && <a href={`/api/projects/${project.id}/exports/${project.latest_export_id}`} className="font-semibold text-teal-700 hover:underline">下载最新DOCX</a>}{view === "archived" ? <><button type="button" onClick={() => void duplicate(project)} disabled={busyId === project.id} className="font-semibold text-teal-700 disabled:opacity-40">基于此项目新建</button><button type="button" onClick={() => void restore(project)} disabled={busyId === project.id} className="font-semibold text-slate-600 disabled:opacity-40">恢复</button></> : <button type="button" onClick={() => void archive(project)} disabled={busyId === project.id} className="text-slate-400 hover:text-red-600 disabled:opacity-40">归档</button>}</span></div></article>)}
    </section>}
  </div>;
}
