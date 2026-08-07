import { NextRequest, NextResponse } from "next/server";
import type { WritingAnalysis, WritingTask } from "../../../types/writing";
import { getDocumentTemplate, ordinaryDocumentTypes } from "../../document-templates";
import { getDatabase } from "../_platform";
import { getChatCompletionsUrl, getWritingAiSettings } from "../_settings";

const requirementKinds = new Set(["structure", "wording", "facts", "policy", "case", "format"]);

interface SelectedComponent {
  name: string;
  description: string;
}

type AnalysisRequest = Partial<WritingTask> & { selectedComponents?: unknown };

function parseSelectedComponents(value: unknown): SelectedComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { name?: unknown; description?: unknown };
    if (typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    return [{
      name: candidate.name.trim().slice(0, 100),
      description: typeof candidate.description === "string" ? candidate.description.trim().slice(0, 300) : "",
    }];
  }).slice(0, 20);
}

function fallbackAnalysis(
  task: Pick<WritingTask, "title" | "documentType" | "documentSubtype" | "purpose">,
  selectedComponents: SelectedComponent[] = [],
): WritingAnalysis {
  const template = getDocumentTemplate(task.documentType, task.documentSubtype);
  return {
    documentPurpose: task.purpose || `围绕“${task.title}”形成${task.documentType}`,
    recommendedStructure: selectedComponents.length
      ? selectedComponents.map((item) => item.name)
      : template.components.filter((item) => item.defaultSelected).map((item) => item.name),
    keywords: [task.title, task.documentType, task.documentSubtype].filter(Boolean),
    riskPoints: ["具体数据必须有来源", "政策依据需要核对有效性", "未核验资料不得作为唯一事实依据"],
    knowledgeRequirement: ["structure", "wording", "facts", "policy", "case"],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as AnalysisRequest | null;
    if (!body || typeof body.title !== "string" || !body.title.trim() || typeof body.department !== "string" || !body.department.trim() || typeof body.purpose !== "string" || !body.purpose.trim()) {
      return NextResponse.json({ error: "请完整填写材料标题、牵头部门和写作目的" }, { status: 400 });
    }
    const allowedTypes: WritingTask["documentType"][] = [...ordinaryDocumentTypes];
    const documentType = allowedTypes.includes(body.documentType as WritingTask["documentType"])
      ? body.documentType as WritingTask["documentType"] : "工作报告";
    const task: WritingTask = {
      title: body.title.trim(),
      documentType,
      documentSubtype: typeof body.documentSubtype === "string" ? body.documentSubtype.trim() : "",
      department: body.department.trim(),
      audience: typeof body.audience === "string" ? body.audience.trim() : "",
      purpose: body.purpose.trim(),
      timeRange: typeof body.timeRange === "string" ? body.timeRange.trim() : "",
      focus: typeof body.focus === "string" ? body.focus.trim() : "",
    };
    const selectedComponents = parseSelectedComponents(body.selectedComponents);
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return NextResponse.json({ ...fallbackAnalysis(task, selectedComponents), fallback: true });
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
          { role: "system", content: "你是政府材料任务分析助手。只返回 JSON，不得虚构政策、数据或部门职责。" },
          { role: "user", content: `分析写作任务：${JSON.stringify(task)}。用户已确认的一级段落组件（顺序不可更改、不可删除）：${JSON.stringify(selectedComponents)}。返回 {documentPurpose:string,recommendedStructure:string[],keywords:string[],riskPoints:string[],knowledgeRequirement:(structure|wording|facts|policy|case|format)[]}。recommendedStructure 必须覆盖全部已确认组件；若组件为空，则按文种生成完整提纲。` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return NextResponse.json({ ...fallbackAnalysis(task, selectedComponents), fallback: true });
    const payload: unknown = await response.json();
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== "string") return NextResponse.json({ ...fallbackAnalysis(task, selectedComponents), fallback: true });
    let parsed: WritingAnalysis;
    try { parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as WritingAnalysis; }
    catch { return NextResponse.json({ ...fallbackAnalysis(task, selectedComponents), fallback: true }); }
    if (!Array.isArray(parsed.recommendedStructure) || !parsed.recommendedStructure.length || !Array.isArray(parsed.keywords) || !Array.isArray(parsed.riskPoints) || !Array.isArray(parsed.knowledgeRequirement)) {
      return NextResponse.json({ ...fallbackAnalysis(task, selectedComponents), fallback: true });
    }
    parsed.knowledgeRequirement = parsed.knowledgeRequirement.filter((item) => requirementKinds.has(item));
    if (selectedComponents.length) {
      parsed.recommendedStructure = selectedComponents.map((item) => item.name);
    }
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    console.error("writing-analysis failed", error);
    return NextResponse.json({ error: "任务分析服务暂时不可用" }, { status: 500 });
  }
}
