"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { theme } from "../../ui-config";

type Permission = "viewer" | "editor" | "reviewer" | "owner";
type Version = { id: number; version_number: number; stage: string; content: string; source_snapshot: string; created_at: string };
type ProjectDocument = { id: number; filename: string; department: string; verification_status: string; selected_passages: string };
type Member = { user_id: string; email: string; display_name: string; role: "viewer" | "editor" | "reviewer"; created_at: string };
type AvailableUser = { id: string; email: string; display_name: string; role: string };
type Review = { id: string; version_id: number; status: string; summary: string; requested_by: string; assigned_to: string | null; decision_note: string | null; requester_name: string; assignee_name: string | null; decider_name: string | null; submitted_at: string; decided_at: string | null };
type ReviewComment = { id: string; review_request_id: string; anchor_text: string; category: string; severity: string; comment: string; status: string; author_name: string; resolver_name: string | null; created_at: string };
type CitationCheck = { id: number; review_request_id: string; marker: string; status: "valid" | "unverified" | "missing"; source_title: string | null; details: string };
type DiffItem = { type: "unchanged" | "added" | "removed"; text: string };
type ProjectDetail = {
  project?: { id: string; title: string; document_type: string; status: string; owner_name: string; current_version_id: number | null; created_at: string; updated_at: string; archived_at: string | null };
  permission?: Permission;
  versions?: Version[]; documents?: ProjectDocument[]; members?: Member[]; reviews?: Review[]; comments?: ReviewComment[]; citationChecks?: CitationCheck[];
  versionComparison?: { fromVersionId: number; toVersionId: number; added: number; removed: number; changes: DiffItem[] } | null;
  exports?: Array<{ id: string; filename: string; file_size: number; created_at: string }>;
  activities?: Array<{ action: string; actor_name: string; created_at: string }>;
  error?: string;
};

const stageLabel: Record<string, string> = { ai_draft: "AI初稿", edited: "人工修改稿", reviewed: "合规诊断稿", final: "审核通过最终稿" };
const reviewLabel: Record<string, string> = { pending: "待审核", changes_requested: "退回修改", approved: "审核通过", cancelled: "已撤销" };
const permissionRank: Record<Permission, number> = { viewer: 1, editor: 2, reviewer: 3, owner: 4 };
const categoryLabel: Record<string, string> = { content: "内容", fact: "事实", policy: "政策", format: "格式", wording: "措辞" };
function parseArray(value: string) { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [anchorText, setAnchorText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentCategory, setCommentCategory] = useState("content");
  const [commentSeverity, setCommentSeverity] = useState("suggestion");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedMemberRole, setSelectedMemberRole] = useState("reviewer");
  const [revisionText, setRevisionText] = useState("");

  const applyPayload = (payload: ProjectDetail) => {
    setData(payload);
    const review = payload.reviews?.[0];
    if (review?.status === "changes_requested") {
      const version = payload.versions?.find((item) => item.id === review.version_id) ?? payload.versions?.[0];
      setRevisionText(version?.content ?? "");
    }
  };
  const refresh = async () => {
    const response = await fetch(`/api/projects/${params.id}?view=review`, { cache: "no-store" });
    const payload = await response.json() as ProjectDetail;
    if (!response.ok) throw new Error(payload.error || "项目加载失败");
    applyPayload(payload);
  };
  const refreshMembers = async () => {
    const response = await fetch(`/api/projects/${params.id}/members?view=all`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { availableUsers?: AvailableUser[] };
    setAvailableUsers(Array.isArray(payload.availableUsers) ? payload.availableUsers : []);
  };

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/projects/${params.id}?view=review`, { cache: "no-store", signal: controller.signal }),
      fetch(`/api/projects/${params.id}/members?view=all`, { cache: "no-store", signal: controller.signal }),
    ]).then(async ([detailResponse, memberResponse]) => {
      const detail = await detailResponse.json() as ProjectDetail;
      if (!detailResponse.ok) throw new Error(detail.error || "项目加载失败");
      applyPayload(detail);
      if (memberResponse.ok) {
        const members = await memberResponse.json() as { availableUsers?: AvailableUser[] };
        setAvailableUsers(Array.isArray(members.availableUsers) ? members.availableUsers : []);
      }
    }).catch((caught: unknown) => { if (!(caught instanceof DOMException)) setError(caught instanceof Error ? caught.message : "项目加载失败"); });
    return () => controller.abort();
  }, [params.id]);

  const latestReview = data?.reviews?.[0];
  const reviewComments = useMemo(() => data?.comments?.filter((item) => item.review_request_id === latestReview?.id) ?? [], [data?.comments, latestReview?.id]);
  const citationChecks = useMemo(() => data?.citationChecks?.filter((item) => item.review_request_id === latestReview?.id) ?? [], [data?.citationChecks, latestReview?.id]);
  const permission = data?.permission ?? "viewer";
  const isArchived = Boolean(data?.project?.archived_at);
  const canEdit = !isArchived && permissionRank[permission] >= permissionRank.editor;
  const canReview = !isArchived && permissionRank[permission] >= permissionRank.reviewer;
  const canManage = !isArchived && permission === "owner";

  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await operation(); await refresh(); }
    catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "操作失败"); }
    finally { setBusy(false); }
  };
  const decideReview = (action: "approve" | "request_changes" | "cancel") => perform(async () => {
    if (!latestReview) return;
    const response = await fetch(`/api/projects/${params.id}/reviews/${latestReview.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note: decisionNote }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || "审核操作失败");
    setDecisionNote("");
  });
  const addComment = () => perform(async () => {
    if (!latestReview) return;
    const response = await fetch(`/api/projects/${params.id}/reviews/${latestReview.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anchorText, category: commentCategory, severity: commentSeverity, comment: commentText }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || "批注保存失败");
    setAnchorText(""); setCommentText("");
  });
  const resolveComment = (commentId: string, resolved: boolean) => perform(async () => {
    if (!latestReview) return;
    const response = await fetch(`/api/projects/${params.id}/reviews/${latestReview.id}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId, resolved }) });
    if (!response.ok) throw new Error("审核意见状态更新失败");
  });
  const saveRevisionAndResubmit = () => perform(async () => {
    if (!revisionText.trim()) throw new Error("修订稿不能为空");
    const sourceVersion = data?.versions?.find((item) => item.id === latestReview?.version_id) ?? data?.versions?.[0];
    const versionResponse = await fetch(`/api/projects/${params.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "edited", content: revisionText, sources: sourceVersion ? parseArray(sourceVersion.source_snapshot) : [], audit: { revisedFromReview: latestReview?.id } }) });
    const version = await versionResponse.json() as { id?: number; error?: string };
    if (!versionResponse.ok || !version.id) throw new Error(version.error || "修订版本保存失败");
    const reviewResponse = await fetch(`/api/projects/${params.id}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId: version.id, summary: "已根据上一轮审核意见完成修改并再次提交。" }) });
    const review = await reviewResponse.json() as { error?: string };
    if (!reviewResponse.ok) throw new Error(review.error || "再次送审失败");
  });
  const updateMember = () => perform(async () => {
    const response = await fetch(`/api/projects/${params.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selectedUserId, role: selectedMemberRole }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || "成员授权失败");
    setSelectedUserId(""); await refreshMembers();
  });
  const removeMember = (userId: string) => perform(async () => {
    const response = await fetch(`/api/projects/${params.id}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("移除成员失败");
    await refreshMembers();
  });
  const restoreProject = () => perform(async () => {
    const response = await fetch(`/api/projects/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || "项目恢复失败");
  });
  const duplicateProject = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${params.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "新项目创建失败");
      window.location.assign(`/generate?projectId=${encodeURIComponent(payload.id)}`);
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "新项目创建失败"); setBusy(false); }
  };
  const exportFinal = async () => {
    const version = data?.versions?.find((item) => item.stage === "final") ?? data?.versions?.[0];
    if (!data?.project || !version) return;
    setBusy(true); setError(null);
    try {
      const content = version.content.split("--- 参考来源列表 ---")[0].trim();
      const response = await fetch("/api/export-docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.project.title, content, projectId: params.id, draftVersionId: version.id }) });
      if (!response.ok) throw new Error("最终 DOCX 生成失败");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `${data.project.title}.docx`; link.click(); URL.revokeObjectURL(url); await refresh();
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "最终 DOCX 生成失败"); }
    finally { setBusy(false); }
  };

  if (error && !data?.project) return <div className="mx-auto max-w-5xl rounded border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>;
  if (!data?.project) return <div className="mx-auto max-w-5xl py-16 text-center text-xs text-slate-400">正在读取完整档案…</div>;
  return <div className="mx-auto max-w-6xl space-y-6">
    <header><Link href="/projects" className="text-xs text-teal-700 hover:underline">← 返回项目列表</Link><div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold text-teal-700">{data.project.document_type} · {isArchived ? "只读归档" : permission === "owner" ? "项目负责人" : permission === "reviewer" ? "审核人员" : permission === "editor" ? "协作编辑" : "只读成员"}</p><h1 className={`${theme.title} mt-1`}>{data.project.title}</h1><p className="mt-2 text-[10px] text-slate-400">负责人：{data.project.owner_name}｜更新于 {new Date(data.project.updated_at).toLocaleString("zh-CN")}{isArchived && data.project.archived_at ? `｜归档于 ${new Date(data.project.archived_at).toLocaleString("zh-CN")}` : ""}</p></div><div className="flex flex-wrap gap-2">{isArchived && <><button onClick={() => void duplicateProject()} disabled={busy} className={theme.primaryBtn}>基于此项目新建</button>{permission === "owner" && <button onClick={() => void restoreProject()} disabled={busy} className={theme.secondaryBtn}>恢复项目</button>}</>}{data.project.status === "completed" && <button onClick={exportFinal} disabled={busy} className={theme.primaryBtn}>生成并归档最终 DOCX</button>}</div></div></header>
    {isArchived && <section className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">该项目已归档，正文、版本、来源、审核记录和 DOCX 均以只读方式保留。需要继续修改时，请先恢复项目；需要起草同类材料时，可直接基于此项目新建。</section>}
    {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}

    <section className={`${theme.card} space-y-4`}><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold text-teal-700">协同审核</p><h2 className="mt-1 font-bold text-slate-800">{latestReview ? reviewLabel[latestReview.status] ?? latestReview.status : "尚未提交审核"}</h2></div>{latestReview && <span className="rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-600">送审 V{data.versions?.find((item) => item.id === latestReview.version_id)?.version_number ?? "-"}</span>}</div>
      {latestReview ? <><p className="text-xs leading-5 text-slate-500">{latestReview.summary || "未填写送审说明"}<br />提交人：{latestReview.requester_name}{latestReview.assignee_name ? `｜指定审核：${latestReview.assignee_name}` : "｜未指定审核人"}</p>
        <div className="grid gap-3 sm:grid-cols-3">{[["引用有效", citationChecks.filter((item) => item.status === "valid").length, "text-emerald-700"], ["来源待核验", citationChecks.filter((item) => item.status === "unverified").length, "text-amber-700"], ["引用无法追溯", citationChecks.filter((item) => item.status === "missing").length, "text-red-700"]].map(([label, value, color]) => <div key={String(label)} className="rounded border border-slate-100 bg-slate-50 p-3"><p className="text-[9px] text-slate-400">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{value}</p></div>)}</div>
        {citationChecks.length > 0 && <details><summary className="cursor-pointer text-[10px] font-semibold text-slate-500">查看引用核验明细</summary><div className="mt-2 space-y-1">{citationChecks.map((item) => <div key={item.id} className="flex justify-between gap-3 rounded border border-slate-100 p-2 text-[10px]"><span>{item.marker} · {item.source_title || "未找到来源"}</span><span className={item.status === "valid" ? "text-emerald-700" : item.status === "missing" ? "text-red-700" : "text-amber-700"}>{item.status === "valid" ? "有效" : item.status === "missing" ? "无法追溯" : "待核验"}</span></div>)}</div></details>}
        {latestReview.status === "pending" && <div className="space-y-3 border-t pt-4"><textarea rows={2} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="填写审核结论或退回修改要求……" className={theme.input} /><div className="flex flex-wrap gap-2">{canReview && <><button onClick={() => decideReview("approve")} disabled={busy} className={theme.primaryBtn}>审核通过并形成最终稿</button><button onClick={() => decideReview("request_changes")} disabled={busy} className={theme.dangerBtn}>退回修改</button></>}{canEdit && <button onClick={() => decideReview("cancel")} disabled={busy} className={theme.secondaryBtn}>撤销送审</button>}</div></div>}
        {latestReview.status === "changes_requested" && canEdit && <div className="space-y-3 border-t pt-4"><h3 className="text-xs font-bold text-slate-700">根据意见修改并再次送审</h3><textarea rows={16} value={revisionText} onChange={(event) => setRevisionText(event.target.value)} className={`${theme.input} font-serif leading-7`} /><button onClick={saveRevisionAndResubmit} disabled={busy || !revisionText.trim()} className={theme.primaryBtn}>保存新版本并再次送审</button></div>}
        {latestReview.decision_note && <p className="rounded bg-slate-50 p-3 text-xs text-slate-600">处理意见：{latestReview.decision_note}</p>}</> : <p className="text-xs text-slate-400">从写作流程确认送审后，审核任务会显示在这里。</p>}
    </section>

    {latestReview && <section className={`${theme.card} space-y-4`}><h2 className="font-bold text-slate-800">段落批注与问题闭环</h2>{reviewComments.length ? <div className="space-y-2">{reviewComments.map((comment) => <article key={comment.id} className={`rounded border p-3 ${comment.status === "resolved" ? "border-slate-100 bg-slate-50/60" : comment.severity === "blocking" ? "border-red-200 bg-red-50/30" : "border-slate-200"}`}><div className="flex flex-wrap items-center gap-2 text-[9px]"><span className="font-semibold text-slate-600">{comment.author_name}</span><span className="rounded bg-white px-1.5 py-0.5">{categoryLabel[comment.category] ?? comment.category}</span><span className={comment.severity === "blocking" ? "text-red-700" : comment.severity === "important" ? "text-amber-700" : "text-slate-400"}>{comment.severity === "blocking" ? "阻断" : comment.severity === "important" ? "重要" : "建议"}</span><span className="ml-auto text-slate-400">{comment.status === "resolved" ? "已解决" : "待处理"}</span></div>{comment.anchor_text && <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-[10px] text-slate-400">{comment.anchor_text}</blockquote>}<p className="mt-2 text-xs leading-5 text-slate-700">{comment.comment}</p>{canEdit && <button onClick={() => resolveComment(comment.id, comment.status !== "resolved")} disabled={busy} className="mt-2 text-[9px] text-teal-700 hover:underline">{comment.status === "resolved" ? "重新打开" : "标记为已解决"}</button>}</article>)}</div> : <p className="text-xs text-slate-400">暂无人工批注。</p>}
      {latestReview.status === "pending" && canReview && <div className="grid gap-3 border-t pt-4 sm:grid-cols-2"><input value={anchorText} onChange={(event) => setAnchorText(event.target.value)} placeholder="粘贴需要定位的原文片段（可选）" className={theme.input} /><div className="flex gap-2"><select value={commentCategory} onChange={(event) => setCommentCategory(event.target.value)} className={theme.input}><option value="content">内容</option><option value="fact">事实</option><option value="policy">政策</option><option value="format">格式</option><option value="wording">措辞</option></select><select value={commentSeverity} onChange={(event) => setCommentSeverity(event.target.value)} className={theme.input}><option value="suggestion">建议</option><option value="important">重要</option><option value="blocking">阻断</option></select></div><textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="填写具体、可执行的修改意见……" rows={3} className={`${theme.input} sm:col-span-2`} /><button onClick={addComment} disabled={busy || !commentText.trim()} className={`${theme.primaryBtn} sm:col-span-2 sm:justify-self-start`}>添加审核批注</button></div>}
    </section>}

    {data.versionComparison && <section className={`${theme.card} space-y-4`}><div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">最近两个版本差异</h2><span className="text-[9px] text-slate-400">新增 {data.versionComparison.added} 段｜删除 {data.versionComparison.removed} 段</span></div><div className="max-h-96 space-y-1 overflow-auto rounded border border-slate-100 p-3">{data.versionComparison.changes.map((item, index) => <p key={index} className={`px-2 py-1 text-[10px] leading-5 ${item.type === "added" ? "bg-emerald-50 text-emerald-800" : item.type === "removed" ? "bg-red-50 text-red-700 line-through" : "text-slate-400"}`}>{item.type === "added" ? "+ " : item.type === "removed" ? "− " : "  "}{item.text}</p>)}</div></section>}

    <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]"><div className={`${theme.card} space-y-4`}><h2 className="font-bold text-slate-800">项目资料包</h2>{data.documents?.length ? data.documents.map((document) => <div key={document.id} className="rounded border border-slate-100 p-3"><p className="text-xs font-semibold text-slate-700">{document.filename}</p><p className="mt-1 text-[9px] text-slate-400">{document.department || "未分类"}｜{document.verification_status === "verified" ? "已核验" : "待核验"}｜已选 {parseArray(document.selected_passages).length} 个片段</p></div>) : <p className="text-xs text-slate-400">尚未关联历史语料。</p>}</div><div className={`${theme.card} space-y-4`}><h2 className="font-bold text-slate-800">文稿版本</h2>{data.versions?.length ? data.versions.map((version) => <details key={version.id} className="rounded border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">V{version.version_number} · {stageLabel[version.stage] ?? version.stage}<span className="ml-2 text-[9px] font-normal text-slate-400">{new Date(version.created_at).toLocaleString("zh-CN")}</span></summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap border-t pt-3 font-sans text-[11px] leading-5 text-slate-600">{version.content}</pre></details>) : <p className="text-xs text-slate-400">尚未形成文稿版本。</p>}</div></section>

    <section className={`${theme.card} space-y-4`}><h2 className="font-bold text-slate-800">项目成员与授权</h2><div className="space-y-2"><div className="flex items-center justify-between rounded border border-slate-100 p-3 text-xs"><span>{data.project.owner_name}</span><span className="text-[9px] text-teal-700">项目负责人</span></div>{data.members?.map((member) => <div key={member.user_id} className="flex items-center justify-between rounded border border-slate-100 p-3 text-xs"><span>{member.display_name}<span className="ml-2 text-[9px] text-slate-400">{member.email}</span></span><span className="flex items-center gap-3 text-[9px] text-slate-500">{member.role === "reviewer" ? "审核" : member.role === "editor" ? "编辑" : "只读"}{canManage && <button onClick={() => removeMember(member.user_id)} className="text-red-600">移除</button>}</span></div>)}</div>{canManage && <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row"><select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className={theme.input}><option value="">选择工作区用户</option>{availableUsers.filter((user) => user.id !== "system-owner" && !data.members?.some((member) => member.user_id === user.id)).map((user) => <option key={user.id} value={user.id}>{user.display_name}（{user.email}）</option>)}</select><select value={selectedMemberRole} onChange={(event) => setSelectedMemberRole(event.target.value)} className={theme.input}><option value="reviewer">审核人员</option><option value="editor">协作编辑</option><option value="viewer">只读成员</option></select><button onClick={updateMember} disabled={busy || !selectedUserId} className={`${theme.secondaryBtn} shrink-0 disabled:opacity-50`}>添加或更新授权</button></div>}<p className="text-[9px] text-slate-400">只有已经通过 Cloudflare Access 访问过系统的用户才会出现在候选列表中。</p></section>

    {data.exports?.length ? <section className={`${theme.card}`}><h2 className="font-bold text-slate-800">归档 DOCX</h2><div className="mt-4 space-y-2">{data.exports.map((item) => <a key={item.id} href={`/api/projects/${params.id}/exports/${item.id}`} className="flex items-center justify-between rounded border border-slate-100 p-3 text-xs hover:border-teal-200 hover:bg-teal-50/30"><span className="font-semibold text-slate-700">{item.filename}</span><span className="text-[9px] text-teal-700">下载 · {Math.max(1, Math.round(item.file_size / 1024))} KB</span></a>)}</div></section> : null}
    <section className={`${theme.card}`}><h2 className="font-bold text-slate-800">操作记录</h2><div className="mt-4 space-y-2">{data.activities?.length ? data.activities.map((activity, index) => <div key={`${activity.created_at}-${index}`} className="flex justify-between border-b border-slate-50 py-2 text-[10px]"><span className="text-slate-600">{activity.actor_name} · {activity.action}</span><span className="text-slate-400">{new Date(activity.created_at).toLocaleString("zh-CN")}</span></div>) : <p className="text-xs text-slate-400">暂无操作记录。</p>}</div></section>
  </div>;
}
