"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { theme } from "../ui-config";
import { documentTypeLabel, normalizeUsageTags, usageTagOptions, type KnowledgeUsageTag } from "../knowledge";
import { getDocumentTemplate, ordinaryDocumentTypes } from "../document-templates";
import { audienceOptions, composeTaskBrief, primaryPlanningTypes, timeRangeOptions, writingTaskPresets, type PlanningDocumentType } from "../writing-task-presets";
import type { DraftAudit, DraftSectionStatus, WritingAnalysis, WritingPlan, WritingTask } from "../../types/writing";

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
  publisher?: string;
  publishedAt?: string;
  excerpt?: string;
  section: string;
  reason: string;
  uses: string[];
  relevanceScore?: number;
  source?: SelectedOfficialSource;
  sourceType: "政府官网";
}

interface OfficialSectionStatus {
  section: string;
  localStatus: "covered" | "weak" | "missing";
  externalStatus: "not-needed" | "supplemented" | "unresolved";
  sourceIds: string[];
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

interface ReviewIssue {
  dimension: "职能职责" | "数据准确性" | "工作来源" | "事件合理性";
  fragment: string;
  description: string;
}

export default function GuidedGeneratePage() {
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [submittedVersionId, setSubmittedVersionId] = useState<number | null>(null);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  const [generationSources, setGenerationSources] = useState<unknown[]>([]);

  // 向导内部表单状态
  const [topic, setTopic] = useState("");
  const [planningType, setPlanningType] = useState<PlanningDocumentType>("auto");
  const [showMoreTypes, setShowMoreTypes] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState(writingTaskPresets.auto.scenarios[0].id);
  const [taskTopic, setTaskTopic] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState("");
  const [selectedAudience, setSelectedAudience] = useState("");
  const [selectedFocuses, setSelectedFocuses] = useState<string[]>(writingTaskPresets.auto.focusOptions.slice(0, 4));
  const [extraRequirement, setExtraRequirement] = useState("");
  const [task, setTask] = useState<WritingTask>({ title: "", documentType: "工作报告", documentSubtype: "", department: "", audience: "", purpose: "", timeRange: "", focus: "" });
  const [analysis, setAnalysis] = useState<WritingAnalysis | null>(null);
  const [taskAssumptions, setTaskAssumptions] = useState<string[]>([]);
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
  const [draftAudit, setDraftAudit] = useState<DraftAudit | null>(null);
  const [officialWritingPlan, setOfficialWritingPlan] = useState("");
  const [officialCandidates, setOfficialCandidates] = useState<OfficialSourceCandidate[]>([]);
  const [officialSections, setOfficialSections] = useState<OfficialSectionStatus[]>([]);
  const [selectedOfficialSources, setSelectedOfficialSources] = useState<SelectedOfficialSource[]>([]);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialError, setOfficialError] = useState<string | null>(null);
  const [fetchingOfficialUrls, setFetchingOfficialUrls] = useState<string[]>([]);
  const [manualOfficialUrl, setManualOfficialUrl] = useState("");
  const [restoredProjectTitle, setRestoredProjectTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualKeyword, setManualKeyword] = useState("");

  useEffect(() => {
    const resumedProjectId = new URLSearchParams(window.location.search).get("projectId");
    if (!resumedProjectId) return;
    const controller = new AbortController();
    void fetch(`/api/projects/${encodeURIComponent(resumedProjectId)}?view=resume`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { project?: { id: string; title: string; document_type: string; task_json: string }; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "续写项目加载失败");
      let parsedTask: Partial<WritingTask> = {};
      try { const value: unknown = JSON.parse(payload.project.task_json || "{}"); if (value && typeof value === "object") parsedTask = value as Partial<WritingTask>; } catch { parsedTask = {}; }
      const documentType = ordinaryDocumentTypes.find((item) => item === parsedTask.documentType || item === payload.project?.document_type) ?? "工作报告";
      const preset = writingTaskPresets[documentType];
      const focusValues = typeof parsedTask.focus === "string" ? parsedTask.focus.split(/[、,，；;]/).map((item) => item.trim()).filter((item) => preset.focusOptions.includes(item)) : [];
      const resumedTask: WritingTask = {
        title: payload.project.title,
        documentType,
        documentSubtype: typeof parsedTask.documentSubtype === "string" ? parsedTask.documentSubtype : "",
        department: typeof parsedTask.department === "string" ? parsedTask.department : "",
        audience: typeof parsedTask.audience === "string" ? parsedTask.audience : "",
        purpose: typeof parsedTask.purpose === "string" ? parsedTask.purpose : "",
        timeRange: typeof parsedTask.timeRange === "string" ? parsedTask.timeRange : "",
        focus: typeof parsedTask.focus === "string" ? parsedTask.focus : "",
      };
      setProjectId(payload.project.id);
      setRestoredProjectTitle(payload.project.title);
      setTask(resumedTask);
      setTaskTopic(payload.project.title.replace(/（续写）$/, ""));
      setPlanningType(documentType);
      setSelectedScenarioId(preset.scenarios[0].id);
      setSelectedFocuses(focusValues.length ? focusValues : preset.focusOptions.slice(0, 4));
      setSelectedTimeRange(resumedTask.timeRange);
      setSelectedAudience(resumedTask.audience);
    }).catch((caught: unknown) => { if (!(caught instanceof DOMException)) setError(caught instanceof Error ? caught.message : "续写项目加载失败"); });
    return () => controller.abort();
  }, []);

  const currentPreset = writingTaskPresets[planningType];
  const selectedScenario = currentPreset.scenarios.find((item) => item.id === selectedScenarioId) ?? currentPreset.scenarios[0];
  const generatedTaskBrief = composeTaskBrief({ planningType, scenario: selectedScenario, topic: taskTopic.trim(), timeRange: selectedTimeRange, audience: selectedAudience, focuses: selectedFocuses, extra: extraRequirement });

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

  const invalidateTaskPlan = () => {
    setAnalysis(null);
    setTaskAssumptions([]);
    setConfirmedOutline([]);
    setError(null);
  };

  const selectPlanningType = (documentType: PlanningDocumentType) => {
    const preset = writingTaskPresets[documentType];
    setPlanningType(documentType);
    setSelectedScenarioId(preset.scenarios[0].id);
    setSelectedFocuses(preset.focusOptions.slice(0, 4));
    invalidateTaskPlan();
  };

  const selectScenario = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    invalidateTaskPlan();
  };

  const toggleFocus = (focus: string) => {
    setSelectedFocuses((current) => current.includes(focus) ? current.filter((item) => item !== focus) : [...current, focus]);
    invalidateTaskPlan();
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (taskTopic.trim().length < 2) {
      setError(`请填写${currentPreset.topicLabel}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/writing-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskBrief: generatedTaskBrief,
          ...(planningType === "auto" ? {} : { documentType: planningType }),
          timeRange: selectedTimeRange,
          audience: selectedAudience,
          focus: selectedFocuses.join("、"),
        }),
      });
      const data = await response.json() as WritingPlan & { error?: string };
      if (!response.ok) throw new Error(data.error || "任务分析失败");
      if (!data.task || !data.analysis || !Array.isArray(data.analysis.recommendedStructure)) throw new Error("任务分析结果不完整");
      setTask(data.task);
      setAnalysis(data.analysis);
      setTaskAssumptions(Array.isArray(data.assumptions) ? data.assumptions : []);
      setConfirmedOutline(data.analysis.recommendedStructure);
      if (projectId) {
        const projectResponse = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.task.title, documentType: data.task.documentType, task: data.task, outline: data.analysis.recommendedStructure, status: "planning" }) });
        if (!projectResponse.ok) throw new Error("写作项目更新失败，请刷新后重试");
      } else {
        const projectResponse = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.task.title, documentType: data.task.documentType, task: data.task, outline: data.analysis.recommendedStructure }) });
        const projectData = await projectResponse.json() as { id?: string; error?: string };
        if (!projectResponse.ok || !projectData.id) throw new Error(projectData.error || "写作项目创建失败");
        setProjectId(projectData.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "任务分析失败");
    } finally { setLoading(false); }
  };

  const handleConfirmPlan = async () => {
    if (!analysis || !task.title.trim() || confirmedOutline.length === 0 || confirmedOutline.some((item) => !item.trim())) {
      setError("AI任务单或提纲不完整，请先调整后再确认");
      return;
    }
    const normalizedOutline = confirmedOutline.map((item) => item.trim());
    const recommendationQuery = [task.documentType, task.documentSubtype, task.title, task.department, task.timeRange, task.focus, ...analysis.keywords].filter(Boolean).join(" ");
    setConfirmedOutline(normalizedOutline);
    setTopic(task.title);
    if (projectId) {
      const response = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: task.title, documentType: task.documentType, task, outline: normalizedOutline, status: "materials" }) });
      if (!response.ok) { setError("提纲保存失败，请稍后重试"); return; }
    }
    setStep(2);
    await triggerSemanticRecommendation(recommendationQuery, normalizedOutline);
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

  const recommendOfficialSources = async () => {
    setOfficialLoading(true);
    setOfficialError(null);
    setOfficialCandidates([]);
    setOfficialSections([]);
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
      const data = await response.json() as { writingPlan?: string; candidates?: OfficialSourceCandidate[]; autoSelectedSources?: SelectedOfficialSource[]; sections?: OfficialSectionStatus[]; warning?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "官方素材推荐失败");
      setOfficialWritingPlan(data.writingPlan || `围绕“${topic}”按确认提纲成文，优先使用已选历史片段，对缺少依据的章节保留待补充标记。`);
      setOfficialCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      setOfficialSections(Array.isArray(data.sections) ? data.sections : []);
      setSelectedOfficialSources(Array.isArray(data.autoSelectedSources) ? data.autoSelectedSources : []);
      setOfficialError(data.warning || null);
    } catch (caught: unknown) {
      setOfficialWritingPlan(`围绕“${topic}”按确认提纲成文，优先使用已选历史片段，对缺少依据的章节保留待补充标记。`);
      setOfficialError(caught instanceof Error ? caught.message : "官方素材推荐失败，可直接继续生成");
    } finally {
      setOfficialLoading(false);
    }
  };

  const handleConfirmCorpus = async () => {
    if (projectId) {
      const grouped = [...new Set(selectedPassages.map((item) => item.documentId))].map((documentId) => ({
        documentId,
        usageTags: documentUses[documentId] ?? [],
        selectedPassages: selectedPassages.filter((item) => item.documentId === documentId),
      }));
      const response = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents: grouped }) });
      if (!response.ok) { setError("项目语料包保存失败，请稍后重试"); return; }
    }
    setSelectedOfficialSources([]);
    setStep(3);
    await recommendOfficialSources();
  };

  const selectOfficialCandidate = async (candidate: OfficialSourceCandidate) => {
    if (candidate.source) {
      setSelectedOfficialSources((current) => {
        const withoutCurrent = current.filter((item) => item.url !== candidate.source!.url);
        const remaining = 18 - withoutCurrent.reduce((sum, item) => sum + item.passages.length, 0);
        if (remaining <= 0) { setOfficialError("单次最多选用 18 个政府官网引用片段，请先移除部分来源"); return current; }
        return [...withoutCurrent, { ...candidate.source!, passages: candidate.source!.passages.slice(0, remaining) }];
      });
      return;
    }
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

  const handlePlannedDocumentTypeChange = (documentType: WritingTask["documentType"]) => {
    const template = getDocumentTemplate(documentType);
    const documentSubtype = template.subtypes?.[0] ?? "";
    setTask((current) => ({ ...current, documentType, documentSubtype }));
    const outline = getDocumentTemplate(documentType, documentSubtype).components.filter((item) => item.defaultSelected).map((item) => item.name);
    setConfirmedOutline(outline);
    setAnalysis((current) => current ? { ...current, recommendedStructure: outline } : current);
  };

  const handlePlannedDocumentSubtypeChange = (documentSubtype: string) => {
    setTask((current) => ({ ...current, documentSubtype }));
    const outline = getDocumentTemplate(task.documentType, documentSubtype).components.filter((item) => item.defaultSelected).map((item) => item.name);
    setConfirmedOutline(outline);
    setAnalysis((current) => current ? { ...current, recommendedStructure: outline } : current);
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
          projectId,
        }),
      });
      const data = await res.json() as { text?: string; draftAudit?: DraftAudit; sources?: unknown[]; error?: string };
      if (!res.ok) throw new Error(data.error || "AI 分段起草失败");
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("AI 未返回有效草稿");
      setResultDraft(data.text);
      setDraftAudit(data.draftAudit ?? null);
      setGenerationSources(Array.isArray(data.sources) ? data.sources : []);
      if (projectId) {
        const versionResponse = await fetch(`/api/projects/${projectId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "ai_draft", content: data.text, sources: data.sources ?? [], audit: data.draftAudit ?? {} }) });
        if (!versionResponse.ok) throw new Error("草稿已生成，但项目版本保存失败");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成草稿失败");
    } finally {
      setLoading(false);
    }
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
      if (projectId) await fetch(`/api/projects/${projectId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "reviewed", content: resultDraft, audit: { reviewIssues: data } }) });
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
      const response = await fetch("/api/export-docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: task.title || topic, content: body, projectId, draftVersionId: submittedVersionId }) });
      if (!response.ok) throw new Error("DOCX 导出失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${task.title || topic || "公文材料"}.docx`; link.click();
      URL.revokeObjectURL(url);
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "DOCX 导出失败"); }
    finally { setExporting(false); }
  };

  const handleFinalize = async () => {
    setLoading(true); setError(null);
    try {
      if (projectId) {
        const response = await fetch(`/api/projects/${projectId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "edited", content: resultDraft, sources: generationSources, audit: { draftAudit, reviewIssues } }) });
        const data = await response.json() as { id?: number; error?: string };
        if (!response.ok || !data.id) throw new Error(data.error || "送审稿保存失败");
        setSubmittedVersionId(data.id);
        const reviewResponse = await fetch(`/api/projects/${projectId}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId: data.id, summary: `完成AI起草与合规诊断，提交“${task.title || topic}”审核。` }) });
        const reviewData = await reviewResponse.json() as { id?: string; error?: string };
        if (!reviewResponse.ok || !reviewData.id) throw new Error(reviewData.error || "提交审核失败");
        setReviewRequestId(reviewData.id);
      }
      setStep(6);
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : "提交审核失败"); }
    finally { setLoading(false); }
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

  const getDraftStatusMeta = (status: DraftSectionStatus) => {
    switch (status) {
      case "supported": return { label: "已有依据", style: "border-emerald-200 bg-emerald-50 text-emerald-700" };
      case "pending": return { label: "待核验", style: "border-amber-200 bg-amber-50 text-amber-700" };
      case "narrative": return { label: "叙述性内容", style: "border-blue-100 bg-blue-50 text-blue-700" };
      case "missing": return { label: "章节缺失", style: "border-red-200 bg-red-50 text-red-700" };
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
    { num: 1, name: "AI任务规划" },
    { num: 2, name: "语料配置" },
    { num: 3, name: "写作要点" },
    { num: 4, name: "AI草稿" },
    { num: 5, name: "合规审查" },
    { num: 6, name: "归档预览" },
  ];

  return (
    <div className={`mx-auto rounded border border-slate-200 bg-white shadow-sm transition-all ${step === 1 ? "max-w-4xl p-4 sm:p-5" : "p-6 sm:p-8"} ${step === 5 ? "max-w-6xl" : step === 2 || step === 4 ? "max-w-5xl" : step === 1 ? "" : "max-w-3xl"}`}>
      
      {/* 顶部指示器 */}
      <div className={`${step === 1 ? "mb-4 pb-4" : "mb-6 pb-6"} border-b border-slate-100`}>
        <div className={`${step === 1 ? "mb-3" : "mb-6"} flex items-center justify-between`}>
          <span className="text-[10px] font-bold text-teal-800 tracking-wider uppercase">政务公文拟文向导</span>
          <Link href="/" className="rounded px-2 py-1 text-[10px] text-slate-400 transition hover:bg-slate-50 hover:text-slate-600" aria-label="退出拟文并返回首页">退出 ×</Link>
        </div>

        <div className="relative grid grid-cols-6 gap-1 sm:gap-2">
          <div className="absolute left-[8%] right-[8%] top-3 h-px bg-slate-100"></div>
          {stepsDef.map((s) => {
            const isCompleted = step > s.num;
            const isActive = step === s.num;
            return (
              <div key={s.num} className="relative z-10 flex min-w-0 flex-col items-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold transition-all ${
                    isCompleted
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : isActive
                      ? "bg-teal-800 border-teal-800 text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  {isCompleted ? "✓" : s.num}
                </div>
                <span className={`mt-1 hidden truncate text-[9px] font-medium sm:block ${isActive ? "font-bold text-teal-800" : "text-slate-400"}`}>
                  {s.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {error && step !== 4 && <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"><span>{error}</span><button type="button" onClick={() => setError(null)} className="font-semibold">关闭</button></div>}

      {/* 第1步：用户表达任务，AI主动补全任务单并生成完整提纲 */}
      {step === 1 && (
        <form onSubmit={handleStep1Submit} className="space-y-4">
          {restoredProjectTitle && <section className="rounded border border-teal-200 bg-teal-50/40 px-4 py-3 text-xs leading-5 text-teal-900"><p className="font-bold">已从归档档案创建续写项目</p><p className="mt-1">已带入原项目的文种、任务信息和参考资料配置。确认短主题后，AI会重新规划本次材料，原归档项目不会被修改。</p></section>}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">AI任务规划</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">选择场景，填写一个短主题</h3>
            </div>
            <p className="max-w-xl text-[10px] leading-4 text-slate-400">AI将自动补全标题、任务信息和提纲；明确选择的文种不会被覆盖。</p>
          </div>

          {!analysis && <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/30 p-4">
            <fieldset>
              <legend className="sr-only">1. 写什么</legend>
              <div className="mb-2 flex items-center justify-between gap-3"><span aria-hidden="true" className="text-xs font-bold text-slate-600">1. 写什么</span><span className="text-[9px] text-slate-400">不确定时选择“AI判断”</span></div>
              <div className="flex flex-wrap gap-2">
                {primaryPlanningTypes.map((documentType) => <button key={documentType} type="button" aria-pressed={planningType === documentType} onClick={() => selectPlanningType(documentType)} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${planningType === documentType ? "border-teal-700 bg-teal-50 font-bold text-teal-800 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}>{documentType === "auto" ? "AI判断" : documentType}</button>)}
                <button type="button" aria-expanded={showMoreTypes} onClick={() => setShowMoreTypes((current) => !current)} className="rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-teal-700 hover:border-teal-300">{showMoreTypes ? "收起" : "更多文种⌄"}</button>
              </div>
              {showMoreTypes && <div className="mt-2 flex flex-wrap gap-2 rounded border border-slate-100 bg-white p-2">{ordinaryDocumentTypes.filter((documentType) => !primaryPlanningTypes.includes(documentType)).map((documentType) => <button key={documentType} type="button" aria-pressed={planningType === documentType} onClick={() => { selectPlanningType(documentType); setShowMoreTypes(false); }} className={`rounded-full border px-3 py-1.5 text-[10px] ${planningType === documentType ? "border-teal-700 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 bg-white text-slate-500 hover:border-teal-200"}`}>{documentType}</button>)}</div>}
            </fieldset>

            <fieldset className="border-t border-slate-100 pt-3">
              <legend className="mb-2 text-xs font-bold text-slate-600">2. 用于什么场景</legend>
              <div className="flex flex-wrap gap-2">
                {currentPreset.scenarios.slice(0, 4).map((scenario) => <button key={scenario.id} type="button" aria-pressed={selectedScenario.id === scenario.id} title={scenario.description} onClick={() => selectScenario(scenario.id)} className={`rounded border px-3 py-2 text-left text-[11px] font-semibold transition ${selectedScenario.id === scenario.id ? "border-teal-600 bg-teal-50 text-teal-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"}`}>{scenario.name}</button>)}
                {currentPreset.scenarios.length > 4 && <details className="relative"><summary className="cursor-pointer list-none rounded border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-teal-700">更多场景⌄</summary><div className="absolute right-0 top-10 z-20 min-w-44 rounded border border-slate-200 bg-white p-2 shadow-lg">{currentPreset.scenarios.slice(4).map((scenario) => <button key={scenario.id} type="button" title={scenario.description} onClick={() => selectScenario(scenario.id)} className="block w-full rounded px-3 py-2 text-left text-[11px] font-semibold text-slate-700 hover:bg-teal-50">{scenario.name}</button>)}</div></details>}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">{selectedScenario.description}</p>
            </fieldset>

            <div className="border-t border-slate-100 pt-3">
              <label htmlFor="writing-task-topic" className="mb-2 block text-xs font-bold text-slate-600">3. 补充短主题</label>
              <input id="writing-task-topic" required minLength={2} maxLength={120} autoFocus autoComplete="off" value={taskTopic} onChange={(event) => { setTaskTopic(event.target.value); invalidateTaskPlan(); }} placeholder={`${currentPreset.topicPlaceholder}，无需编写完整提示词`} className={`${theme.input} bg-white text-sm font-medium`} />
            </div>
          </section>}

          {!analysis && <details className="rounded border border-slate-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">可选调整：时间、报送对象、写作重点和特殊要求</summary>
            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset><legend className={theme.label}>时间范围</legend><div className="flex flex-wrap gap-2">{timeRangeOptions.map((value) => <button key={value} type="button" aria-pressed={selectedTimeRange === value} onClick={() => { setSelectedTimeRange((current) => current === value ? "" : value); invalidateTaskPlan(); }} className={`rounded-full border px-3 py-1.5 text-[10px] ${selectedTimeRange === value ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 text-slate-500"}`}>{value}</button>)}</div></fieldset>
                <fieldset><legend className={theme.label}>报送对象</legend><div className="flex flex-wrap gap-2">{audienceOptions.map((value) => <button key={value} type="button" aria-pressed={selectedAudience === value} onClick={() => { setSelectedAudience((current) => current === value ? "" : value); invalidateTaskPlan(); }} className={`rounded-full border px-3 py-1.5 text-[10px] ${selectedAudience === value ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 text-slate-500"}`}>{value}</button>)}</div></fieldset>
              </div>
              <fieldset><legend className={theme.label}>重点内容（AI已推荐）</legend><div className="flex flex-wrap gap-2">{currentPreset.focusOptions.map((focus) => <button key={focus} type="button" aria-pressed={selectedFocuses.includes(focus)} onClick={() => toggleFocus(focus)} className={`rounded-full border px-3 py-1.5 text-[10px] ${selectedFocuses.includes(focus) ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 bg-white text-slate-500"}`}>{selectedFocuses.includes(focus) ? "✓ " : "+ "}{focus}</button>)}</div></fieldset>
              <div><label htmlFor="writing-extra-requirement" className={theme.label}>特殊要求</label><textarea id="writing-extra-requirement" rows={2} maxLength={1000} value={extraRequirement} onChange={(event) => { setExtraRequirement(event.target.value); invalidateTaskPlan(); }} placeholder="例如：控制在3000字以内，突出问题导向……" className={theme.input} /></div>
            </div>
          </details>}

          {!analysis && <section className="flex flex-col gap-3 rounded border border-teal-100 bg-teal-50/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="text-[10px] font-bold text-teal-700">AI任务摘要</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-teal-950">{taskTopic.trim().length >= 2 ? generatedTaskBrief : `选择文种和场景，再填写${currentPreset.topicLabel}。`}</p></div>
            <button type="submit" disabled={loading || taskTopic.trim().length < 2} className={`${theme.primaryBtn} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}>{loading ? "AI正在理解任务…" : "让AI规划任务 →"}</button>
          </section>}

          {analysis && <div className="space-y-5">
            <section className="rounded border border-teal-200 bg-teal-50/30 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">AI已完成任务理解</p>
                  <h4 className="mt-1 text-base font-bold text-slate-900">{task.title}</h4>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{analysis.documentPurpose}</p>
                </div>
                <span className="rounded-full border border-teal-200 bg-white px-3 py-1 text-[10px] font-semibold text-teal-700">AI建议 · 待确认</span>
              </div>
              <dl className="mt-4 grid gap-3 border-t border-teal-100 pt-4 text-xs sm:grid-cols-2">
                <div><dt className="text-[10px] text-slate-400">文种</dt><dd className="mt-1 font-semibold text-slate-800">{task.documentSubtype || task.documentType}</dd></div>
                <div><dt className="text-[10px] text-slate-400">牵头部门</dt><dd className="mt-1 font-semibold text-slate-800">{task.department || "未指定（不阻断流程）"}</dd></div>
                <div><dt className="text-[10px] text-slate-400">报送对象</dt><dd className="mt-1 font-semibold text-slate-800">{task.audience || "内部正式报送口径"}</dd></div>
                <div><dt className="text-[10px] text-slate-400">时间范围</dt><dd className="mt-1 font-semibold text-slate-800">{task.timeRange || "不限定材料日期"}</dd></div>
                {task.focus && <div className="sm:col-span-2"><dt className="text-[10px] text-slate-400">写作重点</dt><dd className="mt-1 font-semibold text-slate-800">{task.focus}</dd></div>}
              </dl>
              {taskAssumptions.length > 0 && <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-800"><span className="font-semibold">AI采用的默认判断：</span>{taskAssumptions.join("；")}</div>}
            </section>

            <section className="rounded border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">AI推荐完整提纲</h4><p className="mt-1 text-[11px] text-slate-400">确认后，系统将逐章匹配历史语料。</p></div><span className="text-[10px] text-slate-400">共 {confirmedOutline.length} 章</span></div>
              <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                {confirmedOutline.map((item, index) => <li key={`${index}-${item}`} className="flex items-center gap-3 rounded border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-800 text-[9px] font-bold text-white">{index + 1}</span><span className="font-medium">{item}</span></li>)}
              </ol>
            </section>

            <details className="rounded border border-slate-200 bg-slate-50/30 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">高级调整：修改AI判断或提纲</summary>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input aria-label="材料标题" autoComplete="off" placeholder="材料标题" value={task.title} onChange={(event) => setTask((current) => ({ ...current, title: event.target.value }))} className={theme.input} />
                <select aria-label="材料文种" value={task.documentType} onChange={(event) => handlePlannedDocumentTypeChange(event.target.value as WritingTask["documentType"])} className={theme.input}>{ordinaryDocumentTypes.map((type) => <option key={type}>{type}</option>)}</select>
                {activeTemplate.subtypes?.length ? <select aria-label="材料二级类型" value={task.documentSubtype} onChange={(event) => handlePlannedDocumentSubtypeChange(event.target.value)} className={theme.input}>{activeTemplate.subtypes.map((subtype) => <option key={subtype}>{subtype}</option>)}</select> : null}
                <input autoComplete="organization" placeholder="牵头部门（可选）" value={task.department} onChange={(event) => setTask((current) => ({ ...current, department: event.target.value }))} className={theme.input} />
                <input autoComplete="off" placeholder="报送对象（可选）" value={task.audience} onChange={(event) => setTask((current) => ({ ...current, audience: event.target.value }))} className={theme.input} />
                <input autoComplete="off" placeholder="时间范围（可选）" value={task.timeRange} onChange={(event) => setTask((current) => ({ ...current, timeRange: event.target.value }))} className={theme.input} />
                <textarea rows={2} placeholder="写作目的" value={task.purpose} onChange={(event) => setTask((current) => ({ ...current, purpose: event.target.value }))} className={`${theme.input} md:col-span-2`} />
                <textarea rows={2} placeholder="重点关注事项（可选）" value={task.focus} onChange={(event) => setTask((current) => ({ ...current, focus: event.target.value }))} className={`${theme.input} md:col-span-2`} />
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                {confirmedOutline.map((item, index) => <div key={`edit-${index}`} className="flex items-center gap-2"><span className="w-5 text-center text-[10px] font-bold text-teal-800">{index + 1}</span><input aria-label={`第${index + 1}章标题`} value={item} onChange={(event) => setConfirmedOutline((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-teal-600" /><button type="button" disabled={index === 0} onClick={() => moveOutline(index, "up")} className="rounded border border-slate-200 px-2 py-1.5 text-[10px] disabled:opacity-30">上移</button><button type="button" disabled={index === confirmedOutline.length - 1} onClick={() => moveOutline(index, "down")} className="rounded border border-slate-200 px-2 py-1.5 text-[10px] disabled:opacity-30">下移</button><button type="button" onClick={() => setConfirmedOutline((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-red-100 px-2 py-1.5 text-[10px] text-red-600">删除</button></div>)}
                <button type="button" onClick={() => setConfirmedOutline((current) => [...current, "新增章节"])} className="rounded border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600">添加章节</button>
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button type="submit" disabled={loading} className={`${theme.secondaryBtn} disabled:opacity-50`}>{loading ? "正在重新分析…" : "重新分析任务"}</button>
              <button type="button" onClick={() => void handleConfirmPlan()} disabled={loading || confirmedOutline.length === 0} className={`${theme.primaryBtn} disabled:cursor-not-allowed disabled:opacity-50`}>确认任务并匹配历史语料</button>
            </div>
          </div>}
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
                <p className="mt-1 text-slate-500">{[task.documentSubtype || task.documentType, task.department, task.timeRange, task.audience ? `报送${task.audience}` : ""].filter(Boolean).join(" · ")}</p>
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
          <details className="rounded border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-bold text-slate-800">已确认完整提纲（{confirmedOutline.length}章）</h3><p className="mt-1 text-[11px] text-slate-400">提纲已在第一步确认；需要修改时展开此处。</p></div>
              <span className="text-[10px] text-slate-400">展开调整</span>
            </div>
            </summary>
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" disabled={loading} onClick={() => void triggerSemanticRecommendation(`${task.title} ${analysis?.keywords.join(" ") ?? ""}`, confirmedOutline)} className="rounded border border-teal-200 px-3 py-1.5 text-[11px] text-teal-700 disabled:opacity-50">按当前提纲重新检索</button>
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
          </details>
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
            <p className="mt-2 leading-6">{officialLoading ? "正在识别薄弱章节，并逐页提取、校验和匹配政府官网正文…" : officialWritingPlan || "系统将根据已确认提纲和历史语料自动组织写作。"}</p>
          </section>

          <section className="space-y-3 rounded border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800">章节依据补充</h4>
              <p className="mt-1 text-[10px] text-slate-500">AI只检索历史语料覆盖不足的章节，并自动过滤搜索页、备案页和无关网页。通过正文校验的最佳来源已自动选用。</p>
            </div>
            {officialError && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">{officialError}</p>}
            {!officialLoading && officialSections.length === 0 && !officialError && <p className="py-4 text-center text-xs text-slate-400">本次没有需要外部补充的章节，可直接生成。</p>}
            <div className="space-y-3">
              {officialSections.map((item) => {
                const sources = selectedOfficialSources.filter((source) => source.passages.some((passage) => passage.section === item.section));
                const alternatives = officialCandidates.filter((candidate) => candidate.section === item.section);
                const label = item.externalStatus === "supplemented" ? "已自动补充" : item.externalStatus === "unresolved" ? "待核验" : "历史语料已覆盖";
                const labelStyle = item.externalStatus === "supplemented" ? "bg-emerald-50 text-emerald-700" : item.externalStatus === "unresolved" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500";
                return <article key={item.section} className="rounded border border-slate-200 bg-white p-3 text-xs">
                  <div className="flex items-center justify-between gap-3"><h5 className="font-semibold text-slate-800">{item.section}</h5><span className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-semibold ${labelStyle}`}>{label}</span></div>
                  {sources.map((source) => {
                    const passage = source.passages.find((value) => value.section === item.section) ?? source.passages[0];
                    return <div key={source.id} className="mt-3 rounded border border-emerald-100 bg-emerald-50/30 p-3">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-800 hover:text-teal-700 hover:underline">{source.title}</a><p className="mt-1 text-[9px] text-slate-400">{source.publisher}{source.publishedAt ? `｜${source.publishedAt}` : ""}｜正文已留存哈希</p></div><button type="button" onClick={() => setSelectedOfficialSources((current) => current.filter((value) => value.id !== source.id))} className="shrink-0 text-[9px] text-red-600 hover:underline">不采用</button></div>
                      {passage && <div className="mt-2 border-l-2 border-emerald-300 pl-3"><p className="line-clamp-3 leading-5 text-slate-600">{passage.text}</p><p className="mt-1 text-[9px] text-teal-700">命中原因：{passage.matchReasons.join("、")}｜匹配度 {Math.round(passage.score * 100)}%</p></div>}
                    </div>;
                  })}
                  {item.externalStatus === "unresolved" && <p className="mt-2 text-[10px] leading-5 text-amber-700">未找到足够相关且可核验的政府官网正文；生成时将保留待核验提示，不会填入无关内容。</p>}
                  {alternatives.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[10px] text-slate-500">查看 {alternatives.length} 个已验证备选来源</summary><div className="mt-2 space-y-2">{alternatives.map((candidate) => {
                    const selected = selectedOfficialSources.some((source) => source.url === candidate.url);
                    return <div key={candidate.url} className="rounded border border-slate-100 p-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><a href={candidate.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-700 hover:underline">{candidate.title}</a><p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-500">{candidate.excerpt}</p></div><button type="button" disabled={selected} onClick={() => selectOfficialCandidate(candidate)} className="shrink-0 rounded border border-teal-200 px-2 py-1 text-[9px] text-teal-700 disabled:text-slate-400">{selected ? "已采用" : "采用"}</button></div></div>;
                  })}</div></details>}
                </article>;
              })}
            </div>
            <details className="border-t border-slate-100 pt-3">
              <summary className="cursor-pointer text-[10px] font-semibold text-slate-500">没有找到合适来源？手动添加政府官网正文</summary>
              <div className="mt-3 flex gap-2"><input type="url" autoComplete="url" placeholder="粘贴 https://…gov.cn 文章页面" value={manualOfficialUrl} onChange={(event) => setManualOfficialUrl(event.target.value)} className={theme.input} /><button type="button" disabled={!manualOfficialUrl.trim() || fetchingOfficialUrls.includes(manualOfficialUrl.trim())} onClick={() => selectOfficialCandidate({ id: "manual", title: "手动选用的政府官网材料", url: manualOfficialUrl.trim(), section: outlineCoverage.find((item) => item.status !== "covered")?.section || confirmedOutline[0] || "全文", reason: "用户指定的政府官网公开材料", uses: ["facts", "policy"], sourceType: "政府官网" })} className={`${theme.secondaryBtn} shrink-0 disabled:opacity-50`}>{fetchingOfficialUrls.includes(manualOfficialUrl.trim()) ? "正在校验…" : "校验并采用"}</button></div>
            </details>
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
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">AI结构化起草</p>
            <h3 className={`${theme.sectionTitle} mt-1`}>第4步：形成有据可查的公文草稿</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">AI已按文种和提纲组织材料，并自动核对章节完整性、引用覆盖与待补信息。</p>
          </div>
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-teal-800 border-t-transparent"></div>
              <p className="text-xs text-slate-500 animate-pulse">正在按提纲组织材料、绑定事实依据并检查章节完整性，请稍候...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-700 border rounded text-xs">
              <p className="font-semibold">发生故障：{error}</p>
              <button onClick={() => setStep(3)} className="mt-3 px-3 py-1 bg-white border border-red-200 rounded text-xs">重置第三步</button>
            </div>
          ) : (
            <div className="space-y-4">
              {draftAudit && <section className="space-y-4 rounded border border-slate-200 bg-slate-50/40 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["提纲完整度", `${draftAudit.matchedSections}/${draftAudit.sectionCount}`],
                    ["有依据章节", `${draftAudit.citedSections}/${draftAudit.sectionCount}`],
                    ["有效引用", `${draftAudit.verifiedCitationCount} 条`],
                    ["待补数据", `${draftAudit.missingDataCount} 处`],
                  ].map(([label, value]) => <div key={label} className="rounded border border-slate-200 bg-white px-3 py-2"><p className="text-[9px] text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div>)}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {draftAudit.sections.map((section, index) => {
                    const status = getDraftStatusMeta(section.status);
                    return <div key={`${section.title}-${index}`} className="rounded border border-slate-200 bg-white p-3 text-[10px]">
                      <div className="flex items-start justify-between gap-2"><span className="font-semibold text-slate-700">{index + 1}. {section.title}</span><span className={`shrink-0 rounded border px-1.5 py-0.5 ${status.style}`}>{status.label}</span></div>
                      <p className="mt-2 text-slate-400">{section.citations.length ? `引用：${section.citations.join("、")}` : section.usesUserData ? "依据：用户本次补充" : "未使用具体引用"}{section.missingDataCount ? `；待补 ${section.missingDataCount} 处` : ""}</p>
                    </div>;
                  })}
                </div>
                <div className="rounded border border-amber-100 bg-amber-50/60 px-3 py-2 text-[10px] leading-5 text-amber-800">{draftAudit.notices.map((notice) => <p key={notice}>• {notice}</p>)}</div>
              </section>}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="max-h-[560px] overflow-y-auto rounded border bg-white p-5 leading-relaxed">
                  <div className="whitespace-pre-wrap text-sm text-slate-800 font-sans">{renderHighlightText(body)}</div>
                </div>
                <aside className="rounded border border-teal-100 bg-teal-50/30 p-4 text-xs text-teal-900">
                  <p className="font-semibold">AI本次完成的工作</p>
                  <ul className="mt-3 space-y-2 text-[10px] leading-5 text-slate-600">
                    <li>✓ 按确认提纲组织章节</li>
                    <li>✓ 按目标文种调整表达</li>
                    <li>✓ 将事实句绑定到来源片段</li>
                    <li>✓ 标记用户补充和待补数据</li>
                    <li>✓ 检查遗漏、无效引用和未核验来源</li>
                  </ul>
                  <p className="mt-4 border-t border-teal-100 pt-3 text-[9px] leading-4 text-slate-400">“叙述性内容”并不代表错误；如果其中出现具体时间、数字、机构或政策结论，应在下一步补充依据。</p>
                </aside>
              </div>
              {sources && (
                <details className="rounded border border-teal-100 bg-teal-50/30 p-4 text-xs text-teal-800">
                  <summary className="cursor-pointer font-semibold">查看本篇草稿的完整来源清单</summary>
                  <pre className="mt-3 whitespace-pre-wrap font-sans">{sources}</pre>
                </details>
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
            <button onClick={handleFinalize} disabled={loading} className={`${theme.primaryBtn} disabled:opacity-50`}>{loading ? "正在提交…" : "确认送审：进入协同审核"}</button>
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
          <h2 className="text-lg font-bold text-slate-900">第6步：送审稿已保存并进入协同审核</h2>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">正文、来源和引用核验记录已经保存。审核人员确认通过后，系统将生成不可混淆的最终版本。</p>
          {reviewRequestId && <p className="text-[10px] text-slate-400">审核任务：{reviewRequestId}</p>}
          <div className="p-4 bg-slate-50/50 border rounded text-left max-w-xl mx-auto">
            <div className="max-h-40 overflow-y-auto text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">
              {resultDraft}
            </div>
          </div>
          <div className="border-t pt-6 space-x-3">
            <button onClick={() => { navigator.clipboard.writeText(resultDraft); alert("送审稿已复制。"); }} className={theme.secondaryBtn}>复制送审稿</button>
            <button onClick={handleExportDocx} disabled={exporting} className={theme.secondaryBtn}>{exporting ? "正在生成 DOCX…" : "下载送审稿 DOCX"}</button>
            {projectId && <Link href={`/projects/${projectId}`} className={theme.primaryBtn}>进入项目审核台</Link>}
            <button onClick={() => { setStep(1); setProjectId(null); setSubmittedVersionId(null); setReviewRequestId(null); setGenerationSources([]); setTopic(""); setPlanningType("auto"); setShowMoreTypes(false); setSelectedScenarioId(writingTaskPresets.auto.scenarios[0].id); setTaskTopic(""); setSelectedTimeRange(""); setSelectedAudience(""); setSelectedFocuses(writingTaskPresets.auto.focusOptions.slice(0, 4)); setExtraRequirement(""); setTask({ title: "", documentType: "工作报告", documentSubtype: "", department: "", audience: "", purpose: "", timeRange: "", focus: "" }); setAnalysis(null); setTaskAssumptions([]); setConfirmedOutline([]); setPoints(""); setNewData(""); setResultDraft(""); setDraftAudit(null); setOfficialWritingPlan(""); setOfficialCandidates([]); setOfficialSections([]); setSelectedOfficialSources([]); setManualOfficialUrl(""); }} className={theme.primaryBtn}>拟写新篇公文</button>
          </div>
        </div>
      )}

    </div>
  );
}
