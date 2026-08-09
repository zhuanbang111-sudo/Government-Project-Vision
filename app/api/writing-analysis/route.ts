import { NextRequest, NextResponse } from "next/server";
import type { WritingAnalysis, WritingPlan, WritingTask } from "../../../types/writing";
import { getDocumentTemplate, ordinaryDocumentTypes } from "../../document-templates";
import { getDatabase } from "../_platform";
import { getChatCompletionsUrl, getWritingAiSettings } from "../_settings";

const MAX_REQUEST_BYTES = 24_000;
const MAX_AI_RESPONSE_BYTES = 80_000;
const MAX_BRIEF_LENGTH = 4_000;
const requirementKinds = new Set(["structure", "wording", "facts", "policy", "case", "format"]);

type AnalysisRequest = Partial<WritingTask> & { taskBrief?: unknown };

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { return null; }
}

async function readBoundedAiJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_AI_RESPONSE_BYTES) throw new Error("AI_RESPONSE_TOO_LARGE");
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_AI_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("AI_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function inferDocumentType(brief: string, requested?: unknown): WritingTask["documentType"] {
  if (ordinaryDocumentTypes.includes(requested as WritingTask["documentType"])) return requested as WritingTask["documentType"];
  const rules: Array<[RegExp, WritingTask["documentType"]]> = [
    [/领导讲话|讲话稿|致辞|发言稿/, "领导讲话稿"],
    [/督查|检查报告/, "督查检查报告"],
    [/整改报告|整改情况/, "整改报告"],
    [/调研|调查研究/, "调研报告"],
    [/实施方案|工作方案|行动方案/, "实施方案"],
    [/专项工作报告|专项报告/, "专项工作报告"],
    [/情况汇报|汇报材料/, "情况汇报"],
    [/工作总结|年度总结|总结材料/, "工作总结"],
    [/会议纪要|纪要/, "会议纪要"],
    [/周报|本周工作/, "周报"],
    [/请示/, "请示"],
    [/通报/, "通报"],
    [/通知/, "通知"],
    [/函/, "函"],
  ];
  return rules.find(([pattern]) => pattern.test(brief))?.[1] ?? "工作报告";
}

function inferTask(brief: string, body: AnalysisRequest): WritingTask {
  const documentType = inferDocumentType(brief, body.documentType);
  const quotedTitle = brief.match(/《([^》]{4,100})》/)?.[1];
  const timeRange = brief.match(/(?:20\d{2}年)?(?:上半年|下半年|全年|第[一二三四1234]季度|\d{1,2}月|本周|上周|下周|本月|上月|今年|当前阶段)/)?.[0] ?? "";
  const referenceSubject = brief.match(/根据([^，,。；;\n]{2,60}?)(?:材料|资料)[，,]/)?.[1]?.replace(/^(近期|相关|历史|现有)/, "").trim() ?? "";
  const firstClause = brief.split(/[。；;\n]/)[0]?.trim() || brief;
  const subject = firstClause
    .replace(/^(请|请帮我|帮我|需要|拟|计划)?(根据[^，,]{0,80}[，,])?(起草|撰写|编写|写一份|生成|形成)\s*/u, "")
    .replace(/(，|,)?(报送|面向|呈报|提交给).*/u, "")
    .trim()
    .slice(0, 80);
  const genericSubject = new RegExp(`^(?:20\\d{2}年)?(?:上半年|下半年|全年|第[一二三四1234]季度)?${documentType}$`).test(subject);
  const inferredSubject = referenceSubject && genericSubject ? `${timeRange}${referenceSubject}工作` : subject;
  const generatedTitle = quotedTitle || (inferredSubject.includes(documentType) && !genericSubject
    ? inferredSubject
    : documentType === "工作报告" ? `关于${inferredSubject || "有关工作"}的报告` : `关于${inferredSubject || "有关工作"}的${documentType}`);
  const audience = brief.match(/(?:报送|面向|呈报|提交给)([^，,。；;\n]{2,30})/)?.[1]?.trim() ?? "";
  const department = brief.match(/(?:由|牵头部门为|以)([^，,。；;\n]{2,24}(?:处|局|科|办|中心|部门))/)?.[1]?.trim() ?? "";
  const focus = brief.match(/(?:重点(?:写|反映|突出|关注|说明)|主要围绕)([^。；;\n]{2,160})/)?.[1]?.trim() ?? "";
  return {
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : generatedTitle.slice(0, 120),
    documentType,
    documentSubtype: typeof body.documentSubtype === "string" ? body.documentSubtype.trim().slice(0, 80) : "",
    department: typeof body.department === "string" && body.department.trim() ? body.department.trim().slice(0, 80) : department,
    audience: typeof body.audience === "string" && body.audience.trim() ? body.audience.trim().slice(0, 80) : audience,
    purpose: typeof body.purpose === "string" && body.purpose.trim() ? body.purpose.trim().slice(0, 300) : `围绕“${referenceSubject ? `${timeRange}${referenceSubject}工作` : subject || brief.slice(0, 80)}”形成${documentType}`,
    timeRange: typeof body.timeRange === "string" && body.timeRange.trim() ? body.timeRange.trim().slice(0, 80) : timeRange,
    focus: typeof body.focus === "string" && body.focus.trim() ? body.focus.trim().slice(0, 300) : focus,
  };
}

function fallbackPlan(brief: string, body: AnalysisRequest): WritingPlan {
  const task = inferTask(brief, body);
  const template = getDocumentTemplate(task.documentType, task.documentSubtype);
  const assumptions = [
    !task.department ? "未识别牵头部门，暂按通用机关口径处理" : "",
    !task.audience ? "未识别报送对象，暂按内部正式报送口径处理" : "",
    !task.timeRange ? "未识别明确时间范围，检索时不限制材料日期" : "",
  ].filter(Boolean);
  return {
    task,
    analysis: {
      documentPurpose: task.purpose,
      recommendedStructure: template.components.filter((item) => item.defaultSelected).map((item) => item.name),
      keywords: [task.title, task.documentType, task.documentSubtype, task.timeRange, task.focus].filter(Boolean),
      riskPoints: ["具体数据必须有来源", "政策依据需要核对有效性", "未核验资料不得作为唯一事实依据"],
      knowledgeRequirement: ["structure", "wording", "facts", "policy", "case"],
    },
    assumptions,
    fallback: true,
  };
}

function sanitizePlan(candidate: unknown, fallback: WritingPlan): WritingPlan {
  if (!candidate || typeof candidate !== "object") return fallback;
  const value = candidate as { task?: Partial<WritingTask>; analysis?: Partial<WritingAnalysis>; assumptions?: unknown };
  const taskValue = value.task ?? {};
  const documentType = ordinaryDocumentTypes.includes(taskValue.documentType as WritingTask["documentType"])
    ? taskValue.documentType as WritingTask["documentType"] : fallback.task.documentType;
  const task: WritingTask = {
    title: typeof taskValue.title === "string" && taskValue.title.trim() ? taskValue.title.trim().slice(0, 120) : fallback.task.title,
    documentType,
    documentSubtype: typeof taskValue.documentSubtype === "string" ? taskValue.documentSubtype.trim().slice(0, 80) : fallback.task.documentSubtype,
    department: typeof taskValue.department === "string" ? taskValue.department.trim().slice(0, 80) : fallback.task.department,
    audience: typeof taskValue.audience === "string" ? taskValue.audience.trim().slice(0, 80) : fallback.task.audience,
    purpose: typeof taskValue.purpose === "string" && taskValue.purpose.trim() ? taskValue.purpose.trim().slice(0, 300) : fallback.task.purpose,
    timeRange: typeof taskValue.timeRange === "string" ? taskValue.timeRange.trim().slice(0, 80) : fallback.task.timeRange,
    focus: typeof taskValue.focus === "string" ? taskValue.focus.trim().slice(0, 300) : fallback.task.focus,
  };
  const template = getDocumentTemplate(task.documentType, task.documentSubtype);
  const defaultOutline = template.components.filter((item) => item.defaultSelected).map((item) => item.name);
  const outline = Array.isArray(value.analysis?.recommendedStructure)
    ? value.analysis.recommendedStructure.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 100)).slice(0, 20)
    : [];
  const knowledgeRequirement = Array.isArray(value.analysis?.knowledgeRequirement)
    ? value.analysis.knowledgeRequirement.filter((item): item is WritingAnalysis["knowledgeRequirement"][number] => typeof item === "string" && requirementKinds.has(item))
    : fallback.analysis.knowledgeRequirement;
  return {
    task,
    analysis: {
      documentPurpose: typeof value.analysis?.documentPurpose === "string" && value.analysis.documentPurpose.trim() ? value.analysis.documentPurpose.trim().slice(0, 500) : task.purpose,
      recommendedStructure: outline.length ? outline : defaultOutline,
      keywords: Array.isArray(value.analysis?.keywords) ? value.analysis.keywords.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 80)).slice(0, 20) : fallback.analysis.keywords,
      riskPoints: Array.isArray(value.analysis?.riskPoints) ? value.analysis.riskPoints.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 160)).slice(0, 10) : fallback.analysis.riskPoints,
      knowledgeRequirement: knowledgeRequirement.length ? knowledgeRequirement : fallback.analysis.knowledgeRequirement,
    },
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 160)).slice(0, 8) : fallback.assumptions,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJson(request) as AnalysisRequest | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "请求内容格式不正确" }, { status: 400 });
    const legacyBrief = [body.title, body.documentType, body.department, body.purpose, body.focus].filter((item) => typeof item === "string" && item.trim()).join("，");
    const brief = typeof body.taskBrief === "string" && body.taskBrief.trim() ? body.taskBrief.trim() : legacyBrief;
    if (brief.length < 4) return NextResponse.json({ error: "请用一句话描述本次写作任务" }, { status: 400 });
    if (brief.length > MAX_BRIEF_LENGTH) return NextResponse.json({ error: "任务描述最多支持 4000 字" }, { status: 413 });

    const fallback = fallbackPlan(brief, body);
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return NextResponse.json(fallback);
    try {
      const db = await getDatabase();
      const settings = await getWritingAiSettings(db);
      const response = await fetch(getChatCompletionsUrl(settings.baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你是政府材料写作任务策划助手。根据用户的一句话任务，主动推断任务信息并生成完整一级提纲。不得虚构政策、事实、数据或部门职责。缺失且不影响规划的信息留空，并在 assumptions 中说明。只返回 JSON。" },
            { role: "user", content: `用户任务：${brief}\n用户明确提供的覆盖项：${JSON.stringify(body)}\n返回 {task:{title,documentType,documentSubtype,department,audience,purpose,timeRange,focus},analysis:{documentPurpose,recommendedStructure,keywords,riskPoints,knowledgeRequirement},assumptions:string[]}。documentType 必须取值于：${ordinaryDocumentTypes.join("、")}。优先尊重用户明确提供的字段；recommendedStructure 应是可直接确认的完整一级提纲。` },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return NextResponse.json(fallback);
      const payload = await readBoundedAiJson(response);
      const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return NextResponse.json(fallback);
      return NextResponse.json(sanitizePlan(JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")), fallback));
    } catch (providerError: unknown) {
      console.warn("writing-analysis provider unavailable; using deterministic plan", providerError);
      return NextResponse.json(fallback);
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") return NextResponse.json({ error: "任务描述过大" }, { status: 413 });
    console.error("writing-analysis failed", error);
    return NextResponse.json({ error: "任务分析服务暂时不可用" }, { status: 500 });
  }
}
