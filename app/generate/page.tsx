"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { theme } from "../ui-config";
import { documentTypeLabel, safeParseList, usageTagLabel } from "../knowledge";
import type { WritingAnalysis, WritingTask } from "../../types/writing";

interface DocReference {
  id: number;
  filename: string;
  department: string;
  documentType: string;
  usageTags: string;
  verificationStatus: string;
  matchReasons: string[];
  score: number;
}

interface ParagraphType {
  id: number;
  name: string;
  description: string;
}

interface ReviewIssue {
  dimension: "职能职责" | "数据准确性" | "工作来源" | "事件合理性";
  fragment: string;
  description: string;
}

export default function GuidedGeneratePage() {
  const [step, setStep] = useState(1);

  // 向导内部表单状态
  const [topic, setTopic] = useState("");
  const [task, setTask] = useState<WritingTask>({ title: "", documentType: "工作报告", department: "", audience: "", purpose: "", timeRange: "", focus: "" });
  const [analysis, setAnalysis] = useState<WritingAnalysis | null>(null);
  const [confirmedOutline, setConfirmedOutline] = useState<string[]>([]);
  const [recommendedDocs, setRecommendedDocs] = useState<DocReference[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [points, setPoints] = useState("");
  const [newData, setNewData] = useState("");
  const [resultDraft, setResultDraft] = useState("");

  // 新增：段落组件库相关状态
  const [dbParagraphTypes, setAllParagraphTypes] = useState<ParagraphType[]>([]);
  const [selectedParagraphs, setSelectedParagraphs] = useState<ParagraphType[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualKeyword, setManualKeyword] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 审查模块状态
  const [reviewing, setReviewing] = useState(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // 挂载时拉取段落组件库类型
  useEffect(() => {
    fetch("/api/paragraph-types")
      .then(async (res) => ({ ok: res.ok, data: await res.json() as unknown }))
      .then(({ ok, data }) => {
        if (!ok || !Array.isArray(data)) throw new Error("段落类型加载失败");
        setAllParagraphTypes(data);
        // 默认将前4个常用段落预先勾选上，提供顺滑初体验
        if (data.length > 0) {
          setSelectedParagraphs(data.slice(0, 4));
        }
      })
      .catch(() => {});
  }, []);

  // 推荐公文检索
  const triggerSemanticRecommendation = async (keyword: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: keyword, documentType: task.documentType }),
      });
      const data: unknown = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error((data as { error?: string })?.error || "检索发生故障");
      setRecommendedDocs(data);
      const autoChecked = data.slice(0, 4).map((item: DocReference) => item.id);
      setSelectedIds(autoChecked);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.title.trim() || !task.department.trim() || !task.purpose.trim() || selectedParagraphs.length === 0) return;
    setLoading(true);
    setError(null);
    let recommendationQuery = `${task.documentType} ${task.title} ${task.department}`;
    try {
      const response = await fetch("/api/writing-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(task) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "任务分析失败");
      setAnalysis(data as WritingAnalysis);
      setConfirmedOutline((data as WritingAnalysis).recommendedStructure);
      recommendationQuery = `${recommendationQuery} ${(data as WritingAnalysis).keywords.join(" ")}`;
      setTopic(task.title);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "任务分析失败");
      return;
    } finally { setLoading(false); }
    // 使用第一个勾选的段落和主题进行首轮语意检索推荐
    await triggerSemanticRecommendation(recommendationQuery);
  };

  const handleToggleDoc = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const moveOutline = (index: number, direction: "up" | "down") => {
    setConfirmedOutline((current) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKeyword.trim()) return;
    await triggerSemanticRecommendation(manualKeyword);
  };

  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!points.trim()) return;
    setStep(4);
    setLoading(true);
    setError(null);
    try {
      const confirmedParagraphs = confirmedOutline.map((name, index) => ({
        id: index + 1,
        name,
        description: "严格按照用户确认的本节标题和逻辑展开",
      }));
      // 提交到 v3 接口：分段处理 + 整体润色
      const contextualPoints = [
        `文种：${task.documentType}`,
        `牵头部门：${task.department}`,
        task.audience ? `报送对象：${task.audience}` : "",
        `写作目的：${task.purpose}`,
        task.timeRange ? `时间范围：${task.timeRange}` : "",
        task.focus ? `重点关注：${task.focus}` : "",
        analysis?.recommendedStructure.length ? `已确认提纲：${analysis.recommendedStructure.join("；")}` : "",
        `用户写作要点：${points}`,
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/generate-v3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          selectedParagraphs: confirmedParagraphs,
          points: contextualPoints,
          newData,
          selectedIds,
          documentType: task.documentType,
          knowledgeRequirements: analysis?.knowledgeRequirement ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI 分段起草失败");
      setResultDraft(data.text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成草稿失败");
    } finally {
      setLoading(false);
    }
  };

  // 控制组件单项复选勾选
  const handleToggleParagraphSelection = (p: ParagraphType) => {
    setSelectedParagraphs((prev) =>
      prev.some((item) => item.id === p.id)
        ? prev.filter((item) => item.id !== p.id)
        : [...prev, p]
    );
  };

  // 通过 index 互相交换，实现极简且零依赖的节点上下移动排序
  const moveParagraphOrder = (index: number, direction: "up" | "down") => {
    const newList = [...selectedParagraphs];
    if (direction === "up" && index > 0) {
      [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
    } else if (direction === "down" && index < newList.length - 1) {
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    }
    setSelectedParagraphs(newList);
  };

  const handleTriggerAIReview = async () => {
    setReviewing(true);
    setReviewError(null);
    setReviewIssues([]);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftContent: resultDraft, selectedIds }),
      });
      const data: unknown = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error((data as { error?: string })?.error || "审查处理故障");
      setReviewIssues(data);
    } catch (err: unknown) {
      setReviewError(err instanceof Error ? err.message : "连接超时");
    } finally {
      setReviewing(false);
    }
  };

  const handleLocateAndFocus = (fragment: string) => {
    if (!textareaRef.current) return;
    const text = resultDraft;
    const index = text.indexOf(fragment);
    if (index !== -1) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(index, index + fragment.length);
      const approxLine = Math.floor(index / 35);
      textareaRef.current.scrollTop = approxLine * 20;
    } else {
      alert("未能在正文中匹配到该片段。");
    }
  };

  const handleExportDocx = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/export-docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: task.title || topic, content: body }) });
      if (!response.ok) throw new Error("DOCX 导出失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${task.title || topic || "公文材料"}.docx`; link.click();
      URL.revokeObjectURL(url);
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "DOCX 导出失败"); }
    finally { setExporting(false); }
  };

  const getBadgeStyle = (dimension: string) => {
    switch (dimension) {
      case "职能职责": return "bg-red-50 text-red-700 border-red-200";
      case "数据准确性": return "bg-orange-50 text-orange-700 border-orange-200";
      case "工作来源": return "bg-blue-50 text-blue-700 border-blue-200";
      case "事件合理性": return "bg-purple-50 text-purple-700 border-purple-200";
      default: return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const parseResultDraft = () => {
    if (!resultDraft) return { body: "", sources: "" };
    const parts = resultDraft.split("--- 参考来源列表 ---");
    return { body: parts[0]?.trim() || "", sources: parts[1]?.trim() || "" };
  };

  const renderHighlightText = (text: string) => {
    if (!text) return null;
    const parts = text.split("【此处需补充具体数据】");
    return parts.map((part, index) => (
      <React.Fragment key={index}>
        {part}
        {index < parts.length - 1 && (
          <span className="bg-orange-100 text-orange-800 border border-orange-200 px-1.5 py-0.5 rounded font-bold mx-0.5 animate-pulse text-xs">
            【此处需补充具体数据】
          </span>
        )}
      </React.Fragment>
    ));
  };

  const { body, sources } = parseResultDraft();
  const missingDataCount = (body.match(/【此处需补充具体数据】/g) || []).length;

  const stepsDef = [
    { num: 1, name: "指定主题" },
    { num: 2, name: "语料勾选" },
    { num: 3, name: "写作要点" },
    { num: 4, name: "AI草稿" },
    { num: 5, name: "合规审查" },
    { num: 6, name: "归档预览" },
  ];

  return (
    <div className={`mx-auto bg-white p-6 sm:p-8 rounded border border-slate-200 shadow-sm transition-all ${step === 5 ? "max-w-6xl" : "max-w-3xl"}`}>
      
      {/* 顶部指示器 */}
      <div className="border-b border-slate-100 pb-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[10px] font-bold text-teal-800 tracking-wider uppercase">政务公文拟文向导</span>
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">放弃并返回首页</Link>
        </div>

        <div className="flex justify-between items-center relative">
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-100 -z-10"></div>
          {stepsDef.map((s) => {
            const isCompleted = step > s.num;
            const isActive = step === s.num;
            return (
              <div key={s.num} className="flex flex-col items-center flex-1 relative z-10">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${
                    isCompleted
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : isActive
                      ? "bg-teal-800 border-teal-800 text-white shadow-sm scale-110"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  {isCompleted ? "✓" : s.num}
                </div>
                <span className={`text-[10px] mt-2 font-medium ${isActive ? "text-teal-800 font-bold" : "text-slate-400"}`}>
                  {s.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 第1步：多段落多选与 Up/Down 上下移动排序器 */}
      {step === 1 && (
        <form onSubmit={handleStep1Submit} className="space-y-6">
          <h3 className={theme.sectionTitle}>第1步：指定新公文主题与段落构成样式</h3>
          
          <div>
            <label className={theme.label}>拟写新公文主题</label>
            <input type="text" required autoComplete="off" placeholder="例如：开展全市安全生产排查与综合监管" value={topic} onChange={(e) => setTopic(e.target.value)} className={theme.input} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input required autoComplete="off" placeholder="材料标题" value={task.title} onChange={(e) => { setTask((current) => ({ ...current, title: e.target.value })); setTopic(e.target.value); }} className={theme.input} />
            <select value={task.documentType} onChange={(e) => setTask((current) => ({ ...current, documentType: e.target.value as WritingTask["documentType"] }))} className={theme.input}>
              {(["工作报告", "情况汇报", "实施方案", "调研报告", "领导讲话稿"] as const).map((type) => <option key={type}>{type}</option>)}
            </select>
            <input required autoComplete="organization" placeholder="牵头部门" value={task.department} onChange={(e) => setTask((current) => ({ ...current, department: e.target.value }))} className={theme.input} />
            <input autoComplete="off" placeholder="报送对象" value={task.audience} onChange={(e) => setTask((current) => ({ ...current, audience: e.target.value }))} className={theme.input} />
            <input required autoComplete="off" placeholder="写作目的" value={task.purpose} onChange={(e) => setTask((current) => ({ ...current, purpose: e.target.value }))} className={theme.input} />
            <input autoComplete="off" placeholder="时间范围" value={task.timeRange} onChange={(e) => setTask((current) => ({ ...current, timeRange: e.target.value }))} className={theme.input} />
            <input autoComplete="off" placeholder="重点关注事项" value={task.focus} onChange={(e) => setTask((current) => ({ ...current, focus: e.target.value }))} className={theme.input} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* 左半栏：可选段落组件包选框 */}
            <div className="border border-slate-200 p-4 rounded bg-slate-50/20">
              <label className={theme.label}>第一步（左）：勾选本次公文所需段落组件</label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {dbParagraphTypes.map((p) => {
                  const isChecked = selectedParagraphs.some((item) => item.id === p.id);
                  return (
                    <label key={p.id} className="flex items-start space-x-2 text-xs p-2 bg-white rounded border hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={isChecked} onChange={() => handleToggleParagraphSelection(p)} className="mt-0.5" />
                      <div>
                        <p className="font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{p.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 右半栏：调整段落结构顺序 */}
            <div className="border border-slate-200 p-4 rounded bg-slate-50/20 flex flex-col">
              <label className={theme.label}>第一步（右）：点击调整段落行文先后顺序</label>
              {selectedParagraphs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10 flex-1 flex items-center justify-center">请在左侧勾选您需要的段落组件</p>
              ) : (
                <div className="space-y-2 flex-1 overflow-y-auto max-h-64 pr-1">
                  {selectedParagraphs.map((p, index) => (
                    <div key={p.id} className="flex justify-between items-center p-2 bg-white border border-slate-200 rounded text-xs">
                      <span className="font-semibold text-slate-800">{index + 1}. {p.name}</span>
                      <div className="space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveParagraphOrder(index, "up")}
                          className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 rounded text-[10px]"
                        >
                          ▲ 上移
                        </button>
                        <button
                          type="button"
                          disabled={index === selectedParagraphs.length - 1}
                          onClick={() => moveParagraphOrder(index, "down")}
                          className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 rounded text-[10px]"
                        >
                          ▼ 下移
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="text-right border-t pt-4">
            <button type="submit" disabled={selectedParagraphs.length === 0} className={theme.primaryBtn}>
              下一步：推荐公文勾选
            </button>
          </div>
        </form>
      )}

      {/* 第2步 */}
      {step === 2 && (
        <div className="space-y-6">
          {analysis && (
            <section className="rounded border border-teal-100 bg-teal-50/40 p-4 text-xs text-slate-700">
              <h3 className="mb-2 font-bold text-teal-900">AI 任务分析</h3>
              <p className="mb-2">{analysis.documentPurpose}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div><p className="font-semibold">推荐结构</p><ol className="list-decimal pl-4">{analysis.recommendedStructure.map((item) => <li key={item}>{item}</li>)}</ol></div>
                <div><p className="font-semibold">检索关键词</p><p>{analysis.keywords.join("、") || "未提供"}</p><p className="mt-2 font-semibold">风险提示</p><p>{analysis.riskPoints.join("；") || "无"}</p></div>
              </div>
            </section>
          )}
          <section className="rounded border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-bold text-slate-800">确认完整提纲</h3><p className="mt-1 text-[11px] text-slate-400">生成时将严格按照这里确认的章节顺序起草。</p></div>
              <button type="button" onClick={() => setConfirmedOutline((current) => [...current, "新增章节"])} className="rounded border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600">添加章节</button>
            </div>
            <div className="mt-3 space-y-2">
              {confirmedOutline.map((item, index) => <div key={`${index}-${item}`} className="flex items-center gap-2">
                <span className="w-6 text-center text-xs font-bold text-teal-800">{index + 1}</span>
                <input value={item} onChange={(event) => setConfirmedOutline((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className="min-w-0 flex-1 rounded border border-slate-200 px-3 py-2 text-xs outline-none focus:border-teal-600" />
                <button type="button" disabled={index === 0} onClick={() => moveOutline(index, "up")} className="rounded border border-slate-200 px-2 py-1.5 text-[10px] disabled:opacity-30">上移</button>
                <button type="button" disabled={index === confirmedOutline.length - 1} onClick={() => moveOutline(index, "down")} className="rounded border border-slate-200 px-2 py-1.5 text-[10px] disabled:opacity-30">下移</button>
                <button type="button" onClick={() => setConfirmedOutline((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-red-100 px-2 py-1.5 text-[10px] text-red-600">删除</button>
              </div>)}
            </div>
          </section>
          <h3 className={theme.sectionTitle}>第2步：选择深度参考语料</h3>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">已自动推荐高度相关的历史公文。勾选您希望参考和模仿风格的文档：</p>
            {loading && recommendedDocs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 animate-pulse">正在向量匹配推荐参考材料...</p>
            ) : recommendedDocs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 border rounded">暂无自动匹配推荐，可使用下方检索框进行查找</p>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden">
                <div className="grid grid-cols-12 bg-slate-50 text-[10px] text-slate-500 font-semibold p-2 border-b">
                  <div className="col-span-1 text-center">选择</div>
                  <div className="col-span-8">参考公文名称</div>
                  <div className="col-span-3 text-right">匹配关联度</div>
                </div>
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {recommendedDocs.map((doc) => (
                    <label key={doc.id} className="grid grid-cols-12 p-3 items-center hover:bg-slate-50/50 cursor-pointer text-xs">
                      <div className="col-span-1 text-center">
                        <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => handleToggleDoc(doc.id)} />
                      </div>
                      <div className="col-span-8 min-w-0" title={doc.filename}>
                        <p className="truncate font-semibold text-slate-800">{doc.filename}</p>
                        <p className="mt-1 truncate text-[10px] font-normal text-slate-400">{documentTypeLabel(doc.documentType)} · {safeParseList(doc.usageTags).map(usageTagLabel).join("、") || "通用参考"} · {doc.verificationStatus === "verified" ? "已核验" : "未核验"}</p>
                      </div>
                      <div className="col-span-3 text-right text-[10px] text-blue-600 font-bold">{Math.round(doc.score * 100)}%</div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <form onSubmit={handleManualSearch} className="border-t pt-4">
            <div className="flex gap-2">
              <input type="text" autoComplete="off" placeholder="手动输入其他搜索词匹配追加检索..." value={manualKeyword} onChange={(e) => setManualKeyword(e.target.value)} className={theme.input} />
              <button type="submit" disabled={loading} className={theme.secondaryBtn}>检索</button>
            </div>
          </form>
          <div className="rounded border border-teal-100 bg-teal-50/40 px-3 py-2 text-xs text-teal-900">
            已确认 {selectedIds.length} 份参考材料。它们将仅用于结构、措辞和有来源事实的写作参考；未选择的材料不会进入草稿生成。
          </div>
          <div className="flex justify-between border-t pt-4">
            <button onClick={() => setStep(1)} className={theme.secondaryBtn}>上一步</button>
            <button disabled={!confirmedOutline.length || confirmedOutline.some((item) => !item.trim())} onClick={() => setStep(3)} className={`${theme.primaryBtn} disabled:cursor-not-allowed disabled:opacity-50`}>确认提纲并填写写作要求</button>
          </div>
        </div>
      )}

      {/* 第3步 */}
      {step === 3 && (
        <form onSubmit={handleStep3Submit} className="space-y-5">
          <h3 className={theme.sectionTitle}>第3步：输入核心要点与新增数据</h3>
          <div>
            <label className={theme.label}>拟写核心要点 <span className="text-red-500 font-bold">*</span></label>
            <textarea required rows={4} placeholder="例如：1. 由监督检查处牵头排查隐患..." value={points} onChange={(e) => setPoints(e.target.value)} className={theme.input} />
          </div>
          <div>
            <label className={theme.label}>本次特定新增细节 <span className="text-slate-400 text-[10px] font-normal">(可选填)</span></label>
            <textarea rows={3} placeholder="此处可写需要高保真融合进新公文的、而历史公文里没有的数据..." value={newData} onChange={(e) => setNewData(e.target.value)} className={theme.input} />
          </div>
          <div className="flex justify-between border-t pt-4">
            <button type="button" onClick={() => setStep(2)} className={theme.secondaryBtn}>上一步</button>
            <button type="submit" className={theme.primaryBtn}>确认：提请分段拼装与润色</button>
          </div>
        </form>
      )}

      {/* 第4步 */}
      {step === 4 && (
        <div className="space-y-5">
          <h3 className={theme.sectionTitle}>第4步：生成公文草稿结果 (经AI合并与衔接润色)</h3>
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-teal-800 border-t-transparent"></div>
              <p className="text-xs text-slate-500 animate-pulse">正在执行「单段落匹配」+「单段落生成」+「初稿整体润色」，两轮大调用，请稍候...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-700 border rounded text-xs">
              <p className="font-semibold">发生故障：{error}</p>
              <button onClick={() => setStep(3)} className="mt-3 px-3 py-1 bg-white border border-red-200 rounded text-xs">重置第三步</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-5 bg-slate-50/50 border rounded max-h-96 overflow-y-auto leading-relaxed">
                <div className="whitespace-pre-wrap text-sm text-slate-800 font-sans">{renderHighlightText(body)}</div>
              </div>
              {sources && (
                <div className="p-4 bg-teal-50/30 border border-teal-100 rounded text-xs text-teal-800">
                  <p className="font-semibold mb-1">📌 本篇拟稿参考来源文献：</p>
                  <pre className="whitespace-pre-wrap font-sans">{sources}</pre>
                </div>
              )}
              <div className="flex justify-between border-t pt-4">
                <button onClick={() => setStep(3)} className={theme.secondaryBtn}>上一步</button>
                <button onClick={() => setStep(5)} className={theme.primaryBtn}>确认草稿：提请合规诊断</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 第5步 */}
      {step === 5 && (
        <div className="space-y-5">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className={theme.sectionTitle}>第5步：人工微调与 AI 4维诊断</h3>
            <button onClick={handleTriggerAIReview} disabled={reviewing} className={theme.primaryBtn}>
              {reviewing ? "正在合规诊断中..." : "🩺 启动 AI 辅助合规审查"}
            </button>
          </div>

          {missingDataCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs">
              ⚠️ 提示：正文中仍有 <strong className="text-orange-700">{missingDataCount}</strong> 处数据缺失占位符，请配合进行补齐。
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <textarea ref={textareaRef} rows={20} value={resultDraft} onChange={(e) => setResultDraft(e.target.value)} className="w-full border rounded p-4 text-sm font-sans leading-relaxed focus:outline-none focus:ring-1 focus:ring-teal-700 bg-white" />
            </div>

            <div className="w-full lg:w-87.5 border border-slate-200 rounded p-4 bg-slate-50/50 flex flex-col max-h-125">
              <h4 className="text-xs font-bold text-slate-500 border-b pb-2 mb-3">📋 合规性辅助审查报告</h4>
              {reviewing ? (
                <p className="text-xs text-slate-400 text-center py-10 animate-pulse">正在交叉核对职责和数据要素...</p>
              ) : reviewError ? (
                <p className="text-xs text-red-600 text-center py-6">{reviewError}</p>
              ) : reviewIssues.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">暂未排查出违背职责基线或逻辑时间冲突的硬伤。</p>
              ) : (
                <div className="overflow-y-auto space-y-3 flex-1 pr-1">
                  {reviewIssues.map((issue, idx) => (
                    <div key={idx} className="p-3 bg-white border border-slate-200 rounded shadow-xs space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className={`px-1.5 py-0.5 border text-[10px] font-medium rounded ${getBadgeStyle(issue.dimension)}`}>
                          {issue.dimension}
                        </span>
                        <button onClick={() => handleLocateAndFocus(issue.fragment)} className="text-[10px] text-teal-800 font-semibold hover:underline">去修改 ➔</button>
                      </div>
                      <div className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded italic">“{issue.fragment}”</div>
                      <p className="text-slate-600 leading-normal text-[11px]">{issue.description}</p>
                      <div className="text-right">
                        <button onClick={() => setReviewIssues((prev) => prev.filter((_, i) => i !== idx))} className="text-[9px] text-slate-400 hover:text-slate-500">[忽略]</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between border-t pt-4">
            <button onClick={() => setStep(4)} className={theme.secondaryBtn}>上一步</button>
            <button onClick={() => setStep(6)} className={theme.primaryBtn}>最终确认：归档公文</button>
          </div>
        </div>
      )}

      {/* 第6步 */}
      {step === 6 && (
        <div className="space-y-6 py-6 text-center">
          <section className="mx-auto max-w-[210mm] bg-white px-[28mm] py-[25mm] text-left text-slate-900 shadow-sm ring-1 ring-slate-200">
            <h1 className="mb-8 text-center text-2xl font-bold leading-relaxed">{task.title || topic}</h1>
            <div className="space-y-3 font-serif text-[16px] leading-8">{body.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index} className="indent-8">{paragraph}</p>)}</div>
          </section>
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-2xl mb-2 font-bold">✓</div>
          <h2 className="text-lg font-bold text-slate-900">第6步：公文撰写完成并已安全归档！</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">正文及来源引用条目已在本地完成持久化。</p>
          <div className="p-4 bg-slate-50/50 border rounded text-left max-w-xl mx-auto">
            <div className="max-h-40 overflow-y-auto text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">
              {resultDraft}
            </div>
          </div>
          <div className="border-t pt-6 space-x-3">
            <button onClick={() => { navigator.clipboard.writeText(resultDraft); alert("公文已被成功复制。"); }} className={theme.secondaryBtn}>复制公文最终稿</button>
            <button onClick={handleExportDocx} disabled={exporting} className={theme.primaryBtn}>{exporting ? "正在生成 DOCX…" : "下载公文 DOCX"}</button>
            <button onClick={() => { setStep(1); setTopic(""); setPoints(""); setNewData(""); setResultDraft(""); }} className={theme.primaryBtn}>拟写新篇公文</button>
          </div>
        </div>
      )}

    </div>
  );
}
