"use client";

import { useEffect, useState } from "react";
import { theme } from "../ui-config";

type Settings = {
  storage: { mode: "cloudflare"; database: string; objectStorage: string; localConfigurationAvailable: boolean };
  ai: { baseUrl: string; model: string; apiKeyConfigured: boolean; embeddingKeyConfigured: boolean };
  backup: { status: string; message: string; documentCount: number };
};
type Notice = { kind: "success" | "error"; text: string } | null;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"storage" | "ai" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings");
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error((payload as { error?: string }).error || "无法读取系统设置");
      const next = payload as Settings;
      setSettings(next); setBaseUrl(next.ai.baseUrl); setModel(next.ai.model);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "无法读取系统设置" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl, model }) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error((payload as { error?: string }).error || "保存失败");
      const next = payload as Settings;
      setSettings(next); setBaseUrl(next.ai.baseUrl); setModel(next.ai.model);
      setNotice({ kind: "success", text: "AI 服务地址与模型名称已保存" });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); }
    finally { setSaving(false); }
  };

  const test = async (action: "test-storage" | "test-ai") => {
    setTesting(action === "test-storage" ? "storage" : "ai"); setNotice(null);
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json() as { ok?: boolean; message?: string; error?: string };
      setNotice({ kind: response.ok && payload.ok ? "success" : "error", text: payload.message || payload.error || "连接测试失败" });
    } catch { setNotice({ kind: "error", text: "连接测试请求失败" }); }
    finally { setTesting(null); }
  };

  if (loading) return <div className={`${theme.card} text-sm text-slate-500`}>正在读取系统设置…</div>;
  if (!settings) return <div className={`${theme.card} text-sm text-red-700`}>无法读取系统设置，请稍后重试。</div>;

  return <div className="mx-auto max-w-4xl space-y-6">
    <section><p className="text-xs font-semibold text-teal-800">系统设置</p><h1 className="mt-1 text-2xl font-bold text-slate-900">存储与 AI 服务配置</h1><p className="mt-2 text-sm text-slate-500">当前为 Cloudflare 托管模式；密钥始终保存在 Worker Secret 中，不会显示或保存到浏览器。</p></section>
    {notice && <p className={`rounded border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</p>}
    <section className={theme.card}>
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className={theme.sectionTitle}>历史语料存储</h2><p className={theme.body}>原始文件与检索数据已分层保存，适用于当前线上部署。</p></div><span className="rounded bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">Cloudflare 模式</span></div>
      <div className="grid gap-4 sm:grid-cols-2"><label><span className={theme.label}>对象存储</span><input value={settings.storage.objectStorage} disabled className={`${theme.input} cursor-not-allowed bg-slate-100 text-slate-500`} /></label><label><span className={theme.label}>元数据与检索库</span><input value={settings.storage.database} disabled className={`${theme.input} cursor-not-allowed bg-slate-100 text-slate-500`} /></label><label><span className={theme.label}>本地历史语料目录</span><input value="Cloudflare 托管模式下不可用" disabled className={`${theme.input} cursor-not-allowed bg-slate-100 text-slate-400`} /></label><label><span className={theme.label}>MinIO 地址</span><input value="切换到内网部署后可配置" disabled className={`${theme.input} cursor-not-allowed bg-slate-100 text-slate-400`} /></label></div>
      <button onClick={() => void test("test-storage")} disabled={testing !== null} className={`${theme.secondaryBtn} mt-5 disabled:cursor-not-allowed disabled:opacity-60`}>{testing === "storage" ? "正在测试…" : "测试 D1 / R2 连接"}</button>
    </section>
    <section className={theme.card}>
      <div className="mb-5"><h2 className={theme.sectionTitle}>AI 写作服务</h2><p className={theme.body}>可调整受信任服务地址和模型。API 密钥请在 Cloudflare Worker 的 Secrets 中配置。</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><label><span className={theme.label}>AI API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com" className={theme.input} /></label><label><span className={theme.label}>写作模型</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-chat" className={theme.input} /></label></div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className={`rounded px-3 py-1 ${settings.ai.apiKeyConfigured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>DeepSeek 密钥：{settings.ai.apiKeyConfigured ? "已配置" : "未配置"}</span><span className={`rounded px-3 py-1 ${settings.ai.embeddingKeyConfigured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>向量密钥：{settings.ai.embeddingKeyConfigured ? "已配置" : "未配置"}</span></div>
      <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => void save()} disabled={saving} className={`${theme.primaryBtn} disabled:cursor-not-allowed disabled:opacity-60`}>{saving ? "正在保存…" : "保存 AI 设置"}</button><button onClick={() => void test("test-ai")} disabled={testing !== null} className={`${theme.secondaryBtn} disabled:cursor-not-allowed disabled:opacity-60`}>{testing === "ai" ? "正在测试…" : "测试 AI 连接"}</button></div>
    </section>
    <section className={theme.card}><h2 className={theme.sectionTitle}>备份状态</h2><p className={theme.body}>{settings.backup.message}</p><p className="mt-3 text-xs text-slate-500">当前已归档参考文件：{settings.backup.documentCount} 份。线上版不依赖本地目录；如需灾备，请定期导出 D1 并同步 R2 文件至受控存储。</p></section>
  </div>;
}
