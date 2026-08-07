"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { theme } from "../ui-config";
import { documentTypeLabel, normalizeUsageTags, usageTagOptions, type KnowledgeUsageTag } from "../knowledge";
import { getDocumentTemplate, ordinaryDocumentTypes, templateComponentsForClient, type ComponentRequirement } from "../document-templates";
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
  coveredSections: string[];
  passages: PassageRecommendation[];
}

interface PassageRecommendation {
  documentId: number;
  passageId: string;
  passageIndex: number;
  section: string;
  text: string;
  score: number;
  matchReasons: string[];
}

interface OutlineCoverageItem {
  section: string;
  status: "covered" | "weak" | "missing";
  matches: PassageRecommendation[];
}

interface OutlineSearchResponse {
  documents: DocReference[];
  sections: OutlineCoverageItem[];
  mode: "hybrid" | "lexical";
}

interface SelectedPassage {
  passageId: string;
  documentId: number;
  passageIndex: number;
  section: string;
}

interface OfficialSourceCandidate {
  id: string;
  title: string;
  url: string;
  snippet: string;
  section: string;
  reason: string;
  uses: string[];
  sourceType: "政府官网";
}

interface SelectedOfficialSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
  passages: Array<{ passageIndex: number; section: string; text: string; score: number; matchReasons: string[]; uses: KnowledgeUsageTag[] }>;
}

interface ParagraphType {
  id: number;
  key?: string;
  name: string;
  description: string;
  requirement?: ComponentRequirement;
  defaultSelected?: boolean;
  retrievalUses?: string[];
}

const initialTemplate = getDocumentTemplate("工作报告");
const initialComponents = templateComponentsForClient(initialTemplate);

interface ReviewIssue {
  dimension: "职能职责" | "数据准确性" | "工作来源" | "事件合理性";
  fragment: string;
  description: string;
}

export default function GuidedGeneratePage() {
  const [step, setStep] = useState(1);

  // 向导内部表单状态
  const [topic, setTopic] = useState("");
  const [task, setTask] = useState<WritingTask>({ title: "", documentType: "工作报告", documentSubtype: "", department: "", audience: "", purpose: "", timeRange: "", focus: "" });
  const [analysis, setAnalysis] = useState<WritingAnalysis | null>(null);
  const [confirmedOutline, setConfirmedOutline] = useState<string[]>([]);
  const [recommendedDocs, setRecommendedDocs] = useState<DocReference[]>([]);
  const [outlineCoverage, setOutlineCoverage] = useState<OutlineCoverageItem[]>([]);
  const [retrievedOutline, setRetrievedOutline] = useState<string[]>([]);
  const [selectedPassages, setSelectedPassages] = useState<SelectedPassage[]>([]);
  const [documentUses, setDocumentUses] = useState<Record<number, KnowledgeUsageTag[]>>({});
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<number[]>([]);
  const [points, setPoints] = useState("");
  const [newData, setNewData] = useState("");
  const [resultDraft, setResultDraft] = useState("");
  const [officialWritingPlan, setOfficialWritingPlan] = useState("");
  const [officialCandidates, setOfficialCandidates] = useState<OfficialSourceCandidate[]>([]);
  const [selectedOfficialSources, setSelectedOfficialSources] = useState<SelectedOfficialSource[]>([]);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialError, setOfficialError] = useState<string | null>(null);
  const [fetchingOfficialUrls, setFetchingOfficialUrls] = useState<string[]>([]);
  const [manualOfficialUrl, setManualOfficialUrl] = useState("");

  // 新增：段落组件库相关状态
  const [dbParagraphTypes, setAllParagraphTypes] = useState<ParagraphType[]>(initialComponents);
  const [selectedParagraphs, setSelectedParagraphs] = useState<ParagraphType[]>(initialComponents.filter((item) => item.defaultSelected));
  const [templateTouched, setTemplateTouched] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualKeyword, setManualKeyword] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 审查模块状态
  const [reviewing, setReviewing] = useState(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // 推荐公文检索
  const selectedIds = [...new Set(selectedPassages.map((item) => item.documentId))];

  const defaultDocumentUses = (doc: DocReference) => {
    const available = normalizeUsageTags(doc.usageTags);
    const required = analysis?.knowledgeRequirement ?? [];
    const preferred = available.filter((item) => required.includes(item));
    return (preferred.length ? preferred : available.length ? available : ["structure", "wording"]).slice(0, 4) as KnowledgeUsageTag[];
  };

  // 按当前主题和每个提纲章节检索，再以文件为入口展示命中段落。
  const triggerSemanticRecommendation = async (keyword: string, outline = confirmedOutline) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `${keyword} ${task.documentSubtype}`.trim(), documentType: task.documentType, outline }),
      });
      const data: unknown = await res.json();
      const result = data as Partial<OutlineSearchResponse> & { error?: string };
      if (!res.ok || !Array.isArray(result.documents) || !Array.isArray(result.sections)) throw new Error(result.error || "检索发生故障");
      setRecommendedDocs(result.documents);
      setOutlineCoverage(result.sections);
      setRetrievedOutline([...outline]);
      setSelectedPassages([]);
      setDocumentUses({});
      setExpandedDocumentIds(result.documents.slice(0, 2).map((item) => item.id));
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
    let recommendationQuery = `${task.documentType} ${task.documentSubtype} ${task.title} ${task.department}`;
    let recommendationOutline = selectedParagraphs.map((item) => item.name);
    try {
      const response = await fetch("/api/writing-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...task,
          selectedComponents: selectedParagraphs.map(({ name, description }) => ({ name, description })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "任务分析失败");
      setAnalysis(data as WritingAnalysis);
      const recommendedOutline = (data as WritingAnalysis).recommendedStructure;
      recommendationOutline = recommendedOutline;
      setConfirmedOutline(recommendedOutline);
      recommendationQuery = `${recommendationQuery} ${(data as WritingAnalysis).keywords.join(" ")}`;
      setTopic(task.title);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "任务分析失败");
      return;
    } finally { setLoading(false); }
    // 使用第一个勾选的段落和主题进行首轮语意检索推荐
    await triggerSemanticRecommendation(recommendationQuery, recommendationOutline);
  };

  const togglePassage = (doc: DocReference, passage: PassageRecommendation) => {
    setSelectedPassages((current) => {
      if (current.some((item) => item.passageId === passage.passageId)) return current.filter((item) => item.passageId !== passage.passageId);
      if (current.length >= 24) { setError("单次最多选择 24 个引用片段，请先取消部分片段"); return current; }
      return [...current, { passageId: passage.passageId, documentId: doc.id, passageIndex: passage.passageIndex, section: passage.section }];
    });
    setDocumentUses((current) => current[doc.id] ? current : { ...current, [doc.id]: defaultDocumentUses(doc) });
  };

  const toggleDocumentPassages = (doc: DocReference) => {
    const passageIds = new Set(doc.passages.map((item) => item.passageId));
    const allSelected = doc.passages.length > 0 && doc.passages.every((item) => selectedPassages.some((selected) => selected.passageId === item.passageId));
    setSelectedPassages((current) => {
      if (allSelected) return current.filter((item) => !passageIds.has(item.passageId));
      const existingIds = new Set(current.map((item) => item.passageId));
      const additions = doc.passages.filter((item) => !existingIds.has(item.passageId)).map((item) => ({ passageId: item.passageId, documentId: doc.id, passageIndex: item.passageIndex, section: item.section }));
      return [...current, ...additions].slice(0, 24);
    });
    setDocumentUses((current) => current[doc.id] ? current : { ...current, [doc.id]: defaultDocumentUses(doc) });
  };

  const toggleDocumentUse = (doc: DocReference, use: KnowledgeUsageTag) => {
    setDocumentUses((current) => {
      const values = current[doc.id] ?? defaultDocumentUses(doc);
      if (values.length === 1 && values.includes(use)) { setError("每份已选文件至少保留一种参考用途"); return current; }
      const next = values.includes(use) ? values.filter((item) => item !== use) : [...values, use];
      return { ...current, [doc.id]: next };
    });
  };

  const applyRecommendedBundle = () => {
    const recommended = outlineCoverage.flatMap((section) => section.matches.slice(0, 1));
    const unique = [...new Map(recommended.map((item) => [item.passageId, item])).values()].slice(0, 24);
    setSelectedPassages(unique.map((item) => ({ passageId: item.passageId, documentId: item.documentId, passageIndex: item.passageIndex, section: item.section })));
    setDocumentUses((current) => {
      const next = { ...current };
      for (const passage of unique) {
        const doc = recommendedDocs.find((item) => item.id === passage.documentId);
        if (doc && !next[doc.id]) next[doc.id] = defaultDocumentUses(doc);
      }
      return next;
    });
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
    if (selectedPassages.length && !window.confirm("重新检索将清空当前已选引用片段，是否继续？")) return;
    await triggerSemanticRecommendation(manualKeyword);
  };

  const applyDocumentTemplate = (documentType: WritingTask["documentType"], documentSubtype = "") => {
    const template = getDocumentTemplate(documentType, documentSubtype);
    const components = templateComponentsForClient(template);
    setAllParagraphTypes(components);
    setSelectedParagraphs(components.filter((item) => item.defaultSelected));
    setTemplateTouched(false);
  };

  const recommendOfficialSources = async () => {
    setOfficialLoading(true);
    setOfficialError(null);
    setOfficialCandidates([]);
    try {
      const response = await fetch("/api/official-sources/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          documentType: task.documentType,
          outline: confirmedOutline,
          coverage: outlineCoverage.map(({ section, status }) => ({ section, status })),
        }),
      });
      const data = await response.json() as { writingPlan?: string; candidates?: OfficialSourceCandidate[]; warning?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "官方素材推荐失败");
      setOfficialWritingPlan(data.writingPlan || `围绕“${topic}”按确认提纲成文，优先使用已选历史片段，对缺少依据的章节保留待补充标记。`);
      setOfficialCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      setOfficialError(data.warning || null);
    } catch (caught: unknown) {
      setOfficialWritingPlan(`围绕“${topic}”按确认提纲成文，优先使用已选历史片段，对缺少依据的章节保留待补充标记。`);
      setOfficialError(caught instanceof Error ? caught.message : "官方素材推荐失败，可直接继续生成");
    } finally {
      setOfficialLoading(false);
    }
  };

  const handleConfirmCorpus = async () => {
    setSelectedOfficialSources([]);
    setStep(3);
    await recommendOfficialSources();
  };

  const selectOfficialCandidate = async (candidate: OfficialSourceCandidate) => {
    setFetchingOfficialUrls((current) => [...current, candidate.url]);
    setOfficialError(null);
    try {
      const response = await fetch("/api/official-sources/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: candidate.url, title: candidate.title, topic, outline: confirmedOutline, section: candidate.section, uses: candidate.uses }),
      });
      const data = await response.json() as { source?: SelectedOfficialSource; error?: string };
      if (!response.ok || !data.source) throw new Error(data.error || "政府官网素材提取失败");
      setSelectedOfficialSources((current) => {
        const withoutCurrent = current.filter((item) => item.url !== data.source!.url);
        const remaining = 18 - withoutCurrent.reduce((sum, item) => sum + item.passages.length, 0);
        if (remaining <= 0) { setOfficialError("单次最多选用 18 个政府官网引用片段，请先移除部分来源"); return current; }
        return [...withoutCurrent, { ...data.source!, passages: data.source!.passages.slice(0, remaining) }];
      });
    } catch (caught: unknown) {
      setOfficialError(caught instanceof Error ? caught.message : "政府官网素材提取失败");
    } finally {
      setFetchingOfficialUrls((current) => current.filter((url) => url !== candidate.url));
    }
  };

  const handleDocumentTypeChange = (documentType: WritingTask["documentType"]) => {
    if (templateTouched && !window.confirm("切换文种将重新加载该文种的推荐段落组件，是否继续？")) return;
    const template = getDocumentTemplate(documentType);
    const documentSubtype = template.subtypes?.[0] ?? "";
    setTask((current) => ({ ...current, documentType, documentSubtype }));
    applyDocumentTemplate(documentType, documentSubtype);
  };

  const handleDocumentSubtypeChange = (documentSubtype: string) => {
    if (templateTouched && !window.confirm("切换二级类型将重新加载推荐段落组件，是否继续？")) return;
    setTask((current) => ({ ...current, documentSubtype }));
    applyDocumentTemplate(task.documentType, documentSubtype);
  };

  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        task.documentSubtype ? `具体类型：${task.documentSubtype}` : "",
        `牵头部门：${task.department}`,
        task.audience ? `报送对象：${task.audience}` : "",
        `写作目的：${task.purpose}`,
        task.timeRange ? `时间范围：${task.timeRange}` : "",
        task.focus ? `重点关注：${task.focus}` : "",
        analysis?.recommendedStructure.length ? `已确认提纲：${analysis.recommendedStructure.join("；")}` : "",
        officialWritingPlan ? `AI写作计划：${officialWritingPlan}` : "",
        points.trim() ? `用户补充要求：${points}` : "用户无额外写作要求",
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
          selectedReferences: selectedPassages.map((item) => ({
            documentId: item.documentId,
            passageIndex: item.passageIndex,
            section: item.section,
            uses: documentUses[item.documentId] ?? [],
          })),
          externalReferences: selectedOfficialSources.flatMap((source) => source.passages.map((passage) => ({
            sourceId: source.id,
            passageIndex: passage.passageIndex,
            section: passage.section,
            uses: passage.uses,
          }))),
          documentType: task.documentType,
          documentSubtype: task.documentSubtype,
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
    if (p.requirement === "required") return;
    setTemplateTouched(true);
    setSelectedParagraphs((prev) =>
      prev.some((item) => item.id === p.id)
        ? prev.filter((item) => item.id !== p.id)
        : [...prev, p]
    );
  };

  // 通过 index 互相交换，实现极简且零依赖的节点上下移动排序
  const moveParagraphOrder = (index: number, direction: "up" | "down") => {
    setTemplateTouched(true);
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
        body: JSON.stringify({
          draftContent: resultDraft,
          selectedIds,
          selectedReferences: selectedPassages.map((item) => ({ documentId: item.documentId, passageIndex: item.passageIndex })),
          externalReferences: selectedOfficialSources.flatMap((source) => source.passages.map((passage) => ({ sourceId: source.id, passageIndex: passage.passageIndex, section: passage.section, uses: passage.uses }))),
        }),
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
  const activeTemplate = getDocumentTemplate(task.documentType, task.documentSubtype);
  const selectedCoverageCount = new Set(selectedPassages.map((item) => item.section)).size;
  const availableCoverageCount = outlineCoverage.filter((item) => item.status !== "missing").length;
  const retrievalIsStale = retrievedOutline.length > 0 && JSON.stringify(retrievedOutline) !== JSON.stringify(confirmedOutline);

  const stepsDef = [
    { num: 1, name: "指定主题" },
    { num: 2, name: "语料配置" },
    { num: 3, name: "写作要点" },
    { num: 4, name: "AI草稿" },
    { num: 5, name: "合规审查" },
    { num: 6, name: "归档预览" },
  ];

  return (
    <div className={`mx-auto bg-white p-6 sm:p-8 rounded border border-slate-200 shadow-sm transition-all ${step === 5 ? "max-w-6xl" : step === 2 ? "max-w-5xl" : "max-w-3xl"}`}>
      
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

      {error && step !== 4 && <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"><span>{error}</span><button type="button" onClick={() => setError(null)} className="font-semibold">关闭</button></div>}

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
            <select aria-label="材料文种" value={task.documentType} onChange={(e) => handleDocumentTypeChange(e.target.value as WritingTask["documentType"])} className={theme.input}>
              {ordinaryDocumentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            {activeTemplate.subtypes?.length ? <select aria-label="材料二级类型" value={task.documentSubtype} onChange={(e) => handleDocumentSubtypeChange(e.target.value)} className={theme.input}>
              {activeTemplate.subtypes.map((subtype) => <option key={subtype}>{subtype}</option>)}
            </select> : null}
            <input required autoComplete="organization" placeholder="牵头部门" value={task.department} onChange={(e) => setTask((current) => ({ ...current, department: e.target.value }))} className={theme.input} />
            <input autoComplete="off" placeholder="报送对象" value={task.audience} onChange={(e) => setTask((current) => ({ ...current, audience: e.target.value }))} className={theme.input} />
            <input required autoComplete="off" placeholder="写作目的" value={task.purpose} onChange={(e) => setTask((current) => ({ ...current, purpose: e.target.value }))} className={theme.input} />
            <input autoComplete="off" placeholder="时间范围" value={task.timeRange} onChange={(e) => setTask((current) => ({ ...current, timeRange: e.target.value }))} className={theme.input} />
            <input autoComplete="off" placeholder="重点关注事项" value={task.focus} onChange={(e) => setTask((current) => ({ ...current, focus: e.target.value }))} className={theme.input} />
          </div>
          <div className="rounded border border-teal-100 bg-teal-50/40 px-3 py-2 text-xs text-teal-900">
            <span className="font-bold">{task.documentSubtype || task.documentType}</span>：{activeTemplate.description}。推荐逻辑为“{activeTemplate.logic}”，切换文种会同步更新下方组件。
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* 左半栏：可选段落组件包选框 */}
            <div className="border border-slate-200 p-4 rounded bg-slate-50/20">
              <label className={theme.label}>第一步（左）：勾选本次公文所需段落组件</label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {dbParagraphTypes.map((p) => {
                  const isChecked = selectedParagraphs.some((item) => item.id === p.id);
                  return (
                    <label key={p.key ?? p.id} className={`flex items-start space-x-2 text-xs p-2 bg-white rounded border hover:bg-slate-50 ${p.requirement === "required" ? "cursor-not-allowed" : "cursor-pointer"}`}>
                      <input type="checkbox" checked={isChecked} disabled={p.requirement === "required"} onChange={() => handleToggleParagraphSelection(p)} className="mt-0.5" />
                      <div>
                        <p className="flex items-center gap-2 font-bold text-slate-800">{p.name}<span className={`rounded px-1.5 py-0.5 text-[9px] ${p.requirement === "required" ? "bg-red-50 text-red-600" : p.requirement === "optional" ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-600"}`}>{p.requirement === "required" ? "必选" : p.requirement === "optional" ? "可选" : "推荐"}</span></p>
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
              下一步：按提纲匹配语料
            </button>
          </div>
        </form>
      )}

      {/* 第2步 */}
      {step === 2 && (
        <div className="space-y-6">
          <section className="rounded border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">当前写作任务</p>
                <h3 className="mt-1 text-base font-bold text-slate-900">{task.title}</h3>
                <p className="mt-1 text-slate-500">{task.documentSubtype || task.documentType} · {task.department}{task.timeRange ? ` · ${task.timeRange}` : ""}{task.audience ? ` · 报送${task.audience}` : ""}</p>
              </div>
              <button type="button" onClick={() => setStep(1)} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600">修改主题</button>
            </div>
            {task.focus && <p className="mt-3 border-t border-slate-200 pt-3"><span className="font-semibold">重点关注：</span>{task.focus}</p>}
          </section>
          {analysis && (
            <details className="rounded border border-teal-100 bg-teal-50/40 p-4 text-xs text-slate-700">
              <summary className="cursor-pointer font-bold text-teal-900">AI 主题理解与检索范围</summary>
              <p className="mt-3">{analysis.documentPurpose}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div><p className="font-semibold">检索关键词</p><p>{analysis.keywords.join("、") || "未提供"}</p></div>
                <div><p className="font-semibold">风险提示</p><p>{analysis.riskPoints.join("；") || "无"}</p></div>
              </div>
            </details>
          )}
          <section className="rounded border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-bold text-slate-800">确认完整提纲</h3><p className="mt-1 text-[11px] text-slate-400">生成时将严格按照这里确认的章节顺序起草。</p></div>
              <div className="flex gap-2">
                <button type="button" disabled={loading} onClick={() => void triggerSemanticRecommendation(`${task.title} ${analysis?.keywords.join(" ") ?? ""}`, confirmedOutline)} className="rounded border border-teal-200 px-3 py-1.5 text-[11px] text-teal-700 disabled:opacity-50">按当前提纲重新检索</button>
                <button type="button" onClick={() => setConfirmedOutline((current) => [...current, "新增章节"])} className="rounded border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600">添加章节</button>
              </div>
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
          {retrievalIsStale && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">提纲已经修改，当前覆盖结果可能过期。请点击“按当前提纲重新检索”后再继续。</div>}
          <section className="rounded border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-bold text-slate-800">提纲语料覆盖</h3><p className="mt-1 text-[11px] text-slate-400">系统分别检索每个章节，避免只按整篇标题匹配。</p></div>
              <button type="button" disabled={!outlineCoverage.some((item) => item.matches.length)} onClick={applyRecommendedBundle} className="rounded bg-teal-800 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40">采用推荐语料组合</button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {outlineCoverage.map((item) => {
                const selected = selectedPassages.some((passage) => passage.section === item.section);
                return <div key={item.section} className={`rounded border px-3 py-2 text-[11px] ${selected ? "border-emerald-200 bg-emerald-50" : item.status === "covered" ? "border-blue-100 bg-blue-50/50" : item.status === "weak" ? "border-amber-200 bg-amber-50" : "border-red-100 bg-red-50"}`}>
                  <div className="flex justify-between gap-2"><span className="font-semibold text-slate-700">{item.section}</span><span className={selected ? "text-emerald-700" : item.status === "covered" ? "text-blue-600" : item.status === "weak" ? "text-amber-700" : "text-red-600"}>{selected ? "已选引用" : item.status === "covered" ? `匹配${item.matches.length}段` : item.status === "weak" ? "弱匹配" : "缺少语料"}</span></div>
                </div>;
              })}
            </div>
          </section>
          <h3 className={theme.sectionTitle}>第2步：按文件审核命中段落</h3>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">先查看文件的匹配原因和覆盖章节，再展开勾选具体引用段落；只有选中的段落会进入生成接口。</p>
            {loading && recommendedDocs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 animate-pulse">正在向量匹配推荐参考材料...</p>
            ) : recommendedDocs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 border rounded">暂无自动匹配推荐，可使用下方检索框进行查找</p>
            ) : (
              <div className="space-y-3">
                  {recommendedDocs.map((doc) => (
                    <article key={doc.id} className="overflow-hidden rounded border border-slate-200 bg-white text-xs">
                      <div className="flex items-start gap-3 p-4">
                        <button type="button" onClick={() => setExpandedDocumentIds((current) => current.includes(doc.id) ? current.filter((id) => id !== doc.id) : [...current, doc.id])} className="mt-0.5 h-6 w-6 shrink-0 rounded border border-slate-200 text-slate-500" aria-label={`${expandedDocumentIds.includes(doc.id) ? "收起" : "展开"}${doc.filename}`}>{expandedDocumentIds.includes(doc.id) ? "−" : "+"}</button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-slate-800">{doc.filename}</p>
                            <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">综合匹配 {Math.round(doc.score * 100)}%</span>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">{documentTypeLabel(doc.documentType)} · {doc.department} · {doc.verificationStatus === "verified" ? "已核验" : "未核验"}</p>
                          <p className="mt-2 text-[10px] text-slate-500"><span className="font-semibold">覆盖章节：</span>{doc.coveredSections.join("、")}</p>
                          <p className="mt-1 text-[10px] text-slate-500"><span className="font-semibold">推荐理由：</span>{doc.matchReasons.join("；") || "正文语义相关"}</p>
                        </div>
                        <button type="button" onClick={() => toggleDocumentPassages(doc)} className="shrink-0 rounded border border-teal-200 px-2 py-1.5 text-[10px] text-teal-700">{doc.passages.every((passage) => selectedPassages.some((item) => item.passageId === passage.passageId)) ? "取消本文件" : "选择推荐片段"}</button>
                      </div>
                      {expandedDocumentIds.includes(doc.id) && <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                        <fieldset>
                          <legend className="text-[10px] font-semibold text-slate-600">本文件在本次写作中的用途（可多选）</legend>
                          <div className="mt-2 flex flex-wrap gap-2">{usageTagOptions.map((option) => <label key={option.value} className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px]"><input type="checkbox" checked={(documentUses[doc.id] ?? defaultDocumentUses(doc)).includes(option.value)} onChange={() => toggleDocumentUse(doc, option.value)} />{option.label}</label>)}</div>
                        </fieldset>
                        <div className="mt-4 space-y-2">
                          {doc.passages.map((passage) => <label key={passage.passageId} className={`block cursor-pointer rounded border p-3 ${selectedPassages.some((item) => item.passageId === passage.passageId) ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"}`}>
                            <div className="flex items-start gap-2">
                              <input type="checkbox" className="mt-0.5" checked={selectedPassages.some((item) => item.passageId === passage.passageId)} onChange={() => togglePassage(doc, passage)} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-teal-800">适用：{passage.section}</span><span className="text-[10px] text-blue-600">片段匹配 {Math.round(passage.score * 100)}%</span></div>
                                <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed text-slate-600">{passage.text}</p>
                                <p className="mt-2 text-[10px] text-slate-400">{passage.matchReasons.join("；")}</p>
                              </div>
                            </div>
                          </label>)}
                        </div>
                      </div>
                      }
                    </article>
                  ))}
              </div>
            )}
          </div>
          <form onSubmit={handleManualSearch} className="border-t pt-4">
            <div className="flex gap-2">
              <input type="text" autoComplete="off" placeholder="补充主题对象、区域、时间或业务关键词后重新检索..." value={manualKeyword} onChange={(e) => setManualKeyword(e.target.value)} className={theme.input} />
              <button type="submit" disabled={loading} className={theme.secondaryBtn}>按提纲检索</button>
            </div>
          </form>
          <div className="rounded border border-teal-100 bg-teal-50/40 px-3 py-2 text-xs text-teal-900">
            已确认 <strong>{selectedIds.length}</strong> 份文件、<strong>{selectedPassages.length}</strong> 个引用片段；已覆盖 <strong>{selectedCoverageCount}/{confirmedOutline.length}</strong> 个章节（知识库可匹配 {availableCoverageCount}/{confirmedOutline.length} 章）。生成时仅发送这些片段，并按文件用途限制其使用方式。
          </div>
          <div className="flex justify-between border-t pt-4">
            <button onClick={() => setStep(1)} className={theme.secondaryBtn}>上一步</button>
            <button disabled={retrievalIsStale || !confirmedOutline.length || confirmedOutline.some((item) => !item.trim())} onClick={handleConfirmCorpus} className={`${theme.primaryBtn} disabled:cursor-not-allowed disabled:opacity-50`}>确认语料包并生成写作计划</button>
          </div>
        </div>
      )}

      {/* 第3步 */}
      {step === 3 && (
        <form onSubmit={handleStep3Submit} className="space-y-5">
          <h3 className={theme.sectionTitle}>第3步：确认 AI 写作计划与外部依据</h3>
          <section className="rounded border border-teal-100 bg-teal-50/40 p-4 text-xs text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-bold text-teal-900">AI 写作计划摘要</h4>
              <button type="button" disabled={officialLoading} onClick={recommendOfficialSources} className="text-[10px] font-semibold text-teal-700 hover:underline disabled:opacity-50">重新分析</button>
            </div>
            <p className="mt-2 leading-6">{officialLoading ? "正在分析提纲覆盖缺口并检索政府官网索引…" : officialWritingPlan || "系统将根据已确认提纲和历史语料自动组织写作。"}</p>
          </section>

          <section className="space-y-3 rounded border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800">政府官网补充素材（可选）</h4>
              <p className="mt-1 text-[10px] text-slate-500">此处只展示搜索索引中的标题、摘要和链接；只有点击“选用并提取”后，系统才会读取该网页正文。</p>
            </div>
            {officialError && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">{officialError}</p>}
            {!officialLoading && officialCandidates.length === 0 && !officialError && <p className="py-4 text-center text-xs text-slate-400">本次未发现必须补充的政府官网素材，可直接生成。</p>}
            <div className="space-y-2">
              {officialCandidates.map((candidate) => {
                const selected = selectedOfficialSources.some((item) => item.url === candidate.url);
                const fetching = fetchingOfficialUrls.includes(candidate.url);
                return <article key={candidate.url} className="rounded border border-slate-200 bg-white p-3 text-xs">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">政府官网</span><span className="text-[10px] text-teal-700">建议用于：{candidate.section}</span></div>
                      <a href={candidate.url} target="_blank" rel="noreferrer" className="mt-2 block font-semibold text-slate-800 hover:text-teal-700 hover:underline">{candidate.title}</a>
                      <p className="mt-1 line-clamp-2 leading-5 text-slate-500">{candidate.snippet || candidate.reason}</p>
                      <p className="mt-1 text-[10px] text-slate-400">推荐原因：{candidate.reason}</p>
                    </div>
                    <button type="button" disabled={selected || fetching} onClick={() => selectOfficialCandidate(candidate)} className="shrink-0 rounded border border-teal-200 px-3 py-2 text-[10px] font-semibold text-teal-700 disabled:bg-slate-50 disabled:text-slate-400">{selected ? "已选用" : fetching ? "正在提取…" : "选用并提取"}</button>
                  </div>
                </article>;
              })}
            </div>
            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <input type="url" autoComplete="url" placeholder="未找到合适候选时，可粘贴 https://…gov.cn 官方页面" value={manualOfficialUrl} onChange={(event) => setManualOfficialUrl(event.target.value)} className={theme.input} />
              <button type="button" disabled={!manualOfficialUrl.trim() || fetchingOfficialUrls.includes(manualOfficialUrl.trim())} onClick={() => selectOfficialCandidate({ id: "manual", title: "手动选用的政府官网材料", url: manualOfficialUrl.trim(), snippet: "", section: outlineCoverage.find((item) => item.status !== "covered")?.section || confirmedOutline[0] || "全文", reason: "用户指定的政府官网公开材料", uses: ["facts", "policy"], sourceType: "政府官网" })} className={`${theme.secondaryBtn} shrink-0 disabled:opacity-50`}>校验并选用</button>
            </div>
            {selectedOfficialSources.length > 0 && <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 text-[10px] text-emerald-900">
              <p className="font-semibold">已选用 {selectedOfficialSources.length} 个政府官网来源、{selectedOfficialSources.reduce((sum, item) => sum + item.passages.length, 0)} 个命中片段</p>
              <div className="mt-2 space-y-1">{selectedOfficialSources.map((source) => <div key={source.id} className="flex items-center justify-between gap-3"><span className="truncate">{source.publisher}｜{source.title}｜已保存内容哈希</span><button type="button" onClick={() => setSelectedOfficialSources((current) => current.filter((item) => item.id !== source.id))} className="shrink-0 text-red-600 hover:underline">移除</button></div>)}</div>
            </div>}
          </section>

          <details className="rounded border border-slate-200 p-4">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">补充特殊要求或最新数据（均可不填）</summary>
            <div className="mt-4 space-y-4">
              <div>
                <label className={theme.label}>特殊写作要求</label>
                <textarea rows={2} placeholder="例如：突出问题导向、控制在3000字以内……" value={points} onChange={(e) => setPoints(e.target.value)} className={theme.input} />
              </div>
              <div>
                <label className={theme.label}>本次新增事实或数据</label>
                <textarea rows={3} placeholder="仅填写历史材料和官网素材中没有、但本次必须写入的最新数据……" value={newData} onChange={(e) => setNewData(e.target.value)} className={theme.input} />
              </div>
            </div>
          </details>
          <div className="flex justify-between border-t pt-4">
            <button type="button" onClick={() => setStep(2)} className={theme.secondaryBtn}>上一步</button>
            <button type="submit" disabled={officialLoading || fetchingOfficialUrls.length > 0} className={`${theme.primaryBtn} disabled:cursor-not-allowed disabled:opacity-50`}>按计划生成公文草稿</button>
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
            <button onClick={() => { setStep(1); setTopic(""); setPoints(""); setNewData(""); setResultDraft(""); setOfficialWritingPlan(""); setOfficialCandidates([]); setSelectedOfficialSources([]); setManualOfficialUrl(""); }} className={theme.primaryBtn}>拟写新篇公文</button>
          </div>
        </div>
      )}

    </div>
  );
}
