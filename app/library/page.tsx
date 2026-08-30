"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  documentTypeLabel,
  documentTypeOptions,
  normalizeTopicTags,
  safeParseList,
  usageTagLabel,
  usageTagOptions,
  type KnowledgeDocumentType,
  type KnowledgeUsageTag,
} from "../knowledge";
import { appendDocxFiles, readUploadResponse } from "../upload-client";

type DocumentItem = {
  id: number;
  filename: string;
  file_type: string;
  file_size: number | null;
  department: string | null;
  document_type: string;
  usage_tags: string;
  topic_tags: string;
  processing_status: "ready" | "failed" | "disabled";
  vector_status: "pending" | "ready" | "failed";
  verification_status: "unverified" | "verified";
  created_at: string;
  updated_at: string | null;
};

type EditState = {
  department: string;
  documentType: KnowledgeDocumentType;
  usageTags: KnowledgeUsageTag[];
  topicTags: string;
  processingStatus: "ready" | "disabled";
  verificationStatus: "unverified" | "verified";
};

const statusMeta = {
  ready: { label: "可用于写作", className: "bg-emerald-50 text-emerald-700" },
  failed: { label: "处理失败", className: "bg-red-50 text-red-700" },
  disabled: { label: "已停用", className: "bg-slate-100 text-slate-500" },
} as const;

function parseError(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
    ? payload.error : fallback;
}

function formatSize(value: number | null) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "历史数据未记录";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [department, setDepartment] = useState("");
  const [documentType, setDocumentType] = useState<KnowledgeDocumentType | "auto">("auto");
  const [usageTags, setUsageTags] = useState<KnowledgeUsageTag[]>([]);
  const [topicTags, setTopicTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("ready");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewContent, setPreviewContent] = useState("");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok || !Array.isArray(payload)) throw new Error(parseError(payload, "知识资产加载失败"));
      setDocuments(payload as DocumentItem[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "知识资产加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchDocuments(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDocuments]);

  const stats = useMemo(() => ({
    total: documents.length,
    ready: documents.filter((item) => item.processing_status === "ready").length,
    verified: documents.filter((item) => item.verification_status === "verified").length,
    vectorPending: documents.filter((item) => item.vector_status === "pending").length,
    types: Object.fromEntries(documentTypeOptions.map((type) => [type.value, documents.filter((item) => item.document_type === type.value).length])),
  }), [documents]);

  const filteredDocuments = useMemo(() => documents.filter((item) => {
    const itemUsageTags = safeParseList(item.usage_tags);
    const itemTopicTags = safeParseList(item.topic_tags);
    const haystack = `${item.filename} ${item.department ?? ""} ${itemTopicTags.join(" ")}`.toLowerCase();
    return (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (typeFilter === "all" || item.document_type === typeFilter)
      && (usageFilter === "all" || itemUsageTags.includes(usageFilter))
      && (statusFilter === "all" || item.processing_status === statusFilter);
  }), [documents, query, statusFilter, typeFilter, usageFilter]);

  const toggleUploadUsage = (value: KnowledgeUsageTag) => {
    setUsageTags((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setNotice(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("department", department.trim() || "未分类");
      if (documentType !== "auto") formData.append("documentType", documentType);
      if (usageTags.length) formData.append("usageTags", JSON.stringify(usageTags));
      formData.append("topicTags", JSON.stringify(normalizeTopicTags(topicTags)));
      await appendDocxFiles(formData, [selectedFile]);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const result = await readUploadResponse(response);
      if (!result.successCount) throw new Error(result.details[0]?.message || "上传失败");
      setNotice(result.details[0]?.message || "知识资产录入成功");
      setSelectedFile(null);
      setDocumentType("auto");
      setUsageTags([]);
      setTopicTags("");
      const input = document.getElementById("knowledge-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await fetchDocuments();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const beginEdit = (item: DocumentItem) => {
    setEditingId(item.id);
    setEditState({
      department: item.department ?? "",
      documentType: (documentTypeOptions.some((type) => type.value === item.document_type) ? item.document_type : "other") as KnowledgeDocumentType,
      usageTags: safeParseList(item.usage_tags).filter((tag): tag is KnowledgeUsageTag => usageTagOptions.some((option) => option.value === tag)),
      topicTags: safeParseList(item.topic_tags).join("，"),
      processingStatus: item.processing_status === "disabled" ? "disabled" : "ready",
      verificationStatus: item.verification_status,
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editState) return;
    if (!editState.usageTags.length) { setError("请至少选择一种使用用途"); return; }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editState, topicTags: normalizeTopicTags(editState.topicTags) }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(parseError(payload, "保存失败"));
      setEditingId(null);
      setEditState(null);
      setNotice("资产分类与审计状态已更新");
      await fetchDocuments();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async (id: number) => {
    if (previewId === id) { setPreviewId(null); return; }
    setPreviewId(id);
    setPreviewContent("正在读取正文…");
    try {
      const response = await fetch(`/api/documents/${id}`);
      const payload = await response.json() as { content?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "正文读取失败");
      setPreviewContent(payload.content || "未提取到正文");
    } catch (caught: unknown) {
      setPreviewContent(caught instanceof Error ? caught.message : "正文读取失败");
    }
  };

  const deleteDocument = async (item: DocumentItem) => {
    if (!window.confirm(`确定删除“${item.filename}”吗？原文件、索引和知识记录将一并删除。`)) return;
    try {
      const response = await fetch(`/api/documents/${item.id}`, { method: "DELETE" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(parseError(payload, "删除失败"));
      setNotice("知识资产已删除");
      await fetchDocuments();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    }
  };

  return <div className="space-y-6">
    <header>
      <p className="text-xs font-bold tracking-widest text-teal-700">知识资产中心</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">我的参考公文语料</h1>
      <p className="mt-2 text-sm text-slate-500">您上传的原文、检索片段和写作引用均按账号隔离，其他用户及管理员不能读取或调用。</p>
    </header>

    {(notice || error) && <div className={`rounded border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["资产总量", stats.total, "D1 元数据 + R2 原文件"],
        ["可用于写作", stats.ready, "已完成正文解析"],
        ["已人工核验", stats.verified, "可作为严格引用来源"],
        ["待向量化", stats.vectorPending, "仍可使用关键词检索"],
      ].map(([label, value, hint]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p><p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      </div>)}
    </section>

    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <section className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">录入个人参考公文</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">仅支持 DOCX，单文件不超过 8MB。文件只进入当前账号的个人语料库，不会共享给部门或其他用户。</p>
        <form onSubmit={handleUpload} className="mt-5 space-y-4">
          <div><label className="text-xs font-semibold text-slate-700" htmlFor="knowledge-file">选择文件</label><input id="knowledge-file" type="file" accept=".docx" required onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 text-xs file:mr-3 file:border-0 file:bg-teal-50 file:px-3 file:py-2.5 file:font-semibold file:text-teal-800" /></div>
          <div><label className="text-xs font-semibold text-slate-700" htmlFor="department">归属处室</label><input id="department" autoComplete="organization" value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="例如：城建处" className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-teal-600" /></div>
          <div><label className="text-xs font-semibold text-slate-700" htmlFor="document-type">材料文种</label><select id="document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value as KnowledgeDocumentType | "auto")} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"><option value="auto">自动识别（推荐）</option>{documentTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <fieldset><legend className="text-xs font-semibold text-slate-700">使用用途（可多选）</legend><div className="mt-2 grid grid-cols-2 gap-2">{usageTagOptions.map((item) => <label key={item.value} className="flex items-center gap-2 rounded border border-slate-100 px-2 py-2 text-[11px] text-slate-600"><input type="checkbox" checked={usageTags.includes(item.value)} onChange={() => toggleUploadUsage(item.value)} />{item.label}</label>)}</div><p className="mt-1 text-[10px] text-slate-400">未选择时由系统根据正文自动判断。</p></fieldset>
          <div><label className="text-xs font-semibold text-slate-700" htmlFor="topic-tags">主题标签</label><input id="topic-tags" autoComplete="off" value={topicTags} onChange={(event) => setTopicTags(event.target.value)} placeholder="综合管廊，城市建设，2026年" className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-teal-600" /></div>
          <button type="submit" disabled={!selectedFile || uploading} className="w-full rounded bg-teal-800 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{uploading ? "正在解析并入库…" : "录入知识资产"}</button>
        </form>
      </section>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-bold text-slate-900">我的语料库</h2><p className="mt-1 text-xs text-slate-400">仅您可见 · 共显示 {filteredDocuments.length} 份材料</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder="检索文件名、处室或标签" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-teal-600 lg:w-72" /></div>
        <div className="grid gap-2 py-4 sm:grid-cols-3">
          <select aria-label="按文种筛选" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="all">全部文种</option>{documentTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}（{stats.types[item.value] ?? 0}）</option>)}</select>
          <select aria-label="按用途筛选" value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="all">全部用途</option>{usageTagOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select aria-label="按状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="all">全部状态</option><option value="ready">可用于写作</option><option value="disabled">已停用</option><option value="failed">处理失败</option></select>
        </div>

        {loading ? <p className="py-16 text-center text-xs text-slate-400">正在加载知识资产…</p> : filteredDocuments.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-xs text-slate-400">当前筛选条件下没有知识资产</p> : <div className="space-y-3">
          {filteredDocuments.map((item) => {
            const itemUsageTags = safeParseList(item.usage_tags);
            const itemTopicTags = safeParseList(item.topic_tags);
            const status = statusMeta[item.processing_status] ?? statusMeta.ready;
            const editing = editingId === item.id && editState;
            return <article key={item.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-teal-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-all text-sm font-bold text-slate-800">{item.filename}</h3><span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">{documentTypeLabel(item.document_type)}</span><span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>{item.verification_status === "verified" && <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">已核验</span>}</div>
                  <p className="mt-2 text-[11px] text-slate-400">{formatSize(item.file_size)}　·　{item.department || "未分类"}　·　{new Date(item.created_at).toLocaleDateString("zh-CN")}　·　{item.vector_status === "ready" ? "向量已就绪" : item.vector_status === "failed" ? "向量化失败" : "待向量化"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{itemUsageTags.map((tag) => <span key={tag} className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{usageTagLabel(tag)}</span>)}{itemTopicTags.map((tag) => <span key={tag} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500">#{tag}</span>)}</div>
                </div>
                <div className="flex shrink-0 gap-2"><button type="button" onClick={() => void showPreview(item.id)} className="rounded border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50">{previewId === item.id ? "收起" : "预览"}</button><button type="button" onClick={() => beginEdit(item)} className="rounded border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50">编辑</button><button type="button" onClick={() => void deleteDocument(item)} className="rounded border border-red-100 px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50">删除</button></div>
              </div>
              {previewId === item.id && <div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs leading-6 text-slate-600">{previewContent}</div>}
              {editing && <div className="mt-4 grid gap-3 rounded-lg border border-teal-100 bg-teal-50/30 p-4 md:grid-cols-2">
                <input aria-label="归属处室" value={editState.department} onChange={(event) => setEditState({ ...editState, department: event.target.value })} className="rounded border border-slate-200 p-2 text-xs" />
                <select aria-label="材料文种" value={editState.documentType} onChange={(event) => setEditState({ ...editState, documentType: event.target.value as KnowledgeDocumentType })} className="rounded border border-slate-200 bg-white p-2 text-xs">{documentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                <input aria-label="主题标签" value={editState.topicTags} onChange={(event) => setEditState({ ...editState, topicTags: event.target.value })} placeholder="主题标签，以逗号分隔" className="rounded border border-slate-200 p-2 text-xs" />
                <div className="flex gap-2"><select aria-label="使用状态" value={editState.processingStatus} onChange={(event) => setEditState({ ...editState, processingStatus: event.target.value as "ready" | "disabled" })} className="min-w-0 flex-1 rounded border border-slate-200 bg-white p-2 text-xs"><option value="ready">可用于写作</option><option value="disabled">停用</option></select><select aria-label="核验状态" value={editState.verificationStatus} onChange={(event) => setEditState({ ...editState, verificationStatus: event.target.value as "verified" | "unverified" })} className="min-w-0 flex-1 rounded border border-slate-200 bg-white p-2 text-xs"><option value="unverified">未核验</option><option value="verified">已核验</option></select></div>
                <fieldset className="md:col-span-2"><legend className="text-[11px] font-semibold text-slate-600">使用用途</legend><div className="mt-2 flex flex-wrap gap-2">{usageTagOptions.map((option) => <label key={option.value} className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px]"><input type="checkbox" checked={editState.usageTags.includes(option.value)} onChange={() => setEditState({ ...editState, usageTags: editState.usageTags.includes(option.value) ? editState.usageTags.filter((value) => value !== option.value) : [...editState.usageTags, option.value] })} />{option.label}</label>)}</div></fieldset>
                <div className="flex gap-2 md:col-span-2"><button type="button" onClick={() => void saveEdit()} disabled={saving} className="rounded bg-teal-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "保存中…" : "保存修改"}</button><button type="button" onClick={() => { setEditingId(null); setEditState(null); }} className="rounded border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">取消</button></div>
              </div>}
            </article>;
          })}
        </div>}
      </section>
    </div>
  </div>;
}
