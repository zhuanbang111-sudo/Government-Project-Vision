import { NextRequest, NextResponse } from "next/server";
import type { WritingAnalysis, WritingTask } from "../../../types/writing";
import { getDatabase } from "../_platform";
import { getChatCompletionsUrl, getWritingAiSettings } from "../_settings";

const requirementKinds = new Set(["structure", "wording", "facts", "policy", "case", "format"]);

function fallbackAnalysis(task: Pick<WritingTask, "title" | "documentType" | "purpose">): WritingAnalysis {
  const structures: Record<WritingTask["documentType"], string[]> = {
    工作报告: ["总体情况", "主要工作及成效", "存在问题", "下一步工作安排"],
    情况汇报: ["基本情况", "工作进展", "存在问题", "有关建议"],
    实施方案: ["总体要求", "主要目标", "重点任务", "实施步骤", "保障措施"],
    调研报告: ["调研背景", "基本情况", "问题分析", "对策建议"],
    领导讲话稿: ["提高认识", "总结成效", "部署重点任务", "压实工作责任"],
  };
  return {
    documentPurpose: task.purpose || `围绕“${task.title}”形成${task.documentType}`,
    recommendedStructure: structures[task.documentType],
    keywords: [task.title, task.documentType].filter(Boolean),
    riskPoints: ["具体数据必须有来源", "政策依据需要核对有效性", "未核验资料不得作为唯一事实依据"],
    knowledgeRequirement: ["structure", "wording", "facts", "policy", "case"],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Partial<WritingTask> | null;
    if (!body || typeof body.title !== "string" || !body.title.trim() || typeof body.department !== "string" || !body.department.trim() || typeof body.purpose !== "string" || !body.purpose.trim()) {
      return NextResponse.json({ error: "请完整填写材料标题、牵头部门和写作目的" }, { status: 400 });
    }
    const allowedTypes: WritingTask["documentType"][] = ["工作报告", "情况汇报", "实施方案", "调研报告", "领导讲话稿"];
    const documentType = allowedTypes.includes(body.documentType as WritingTask["documentType"])
      ? body.documentType as WritingTask["documentType"] : "工作报告";
    const task: WritingTask = {
      title: body.title.trim(),
      documentType,
      department: body.department.trim(),
      audience: typeof body.audience === "string" ? body.audience.trim() : "",
      purpose: body.purpose.trim(),
      timeRange: typeof body.timeRange === "string" ? body.timeRange.trim() : "",
      focus: typeof body.focus === "string" ? body.focus.trim() : "",
    };
    const fallback = fallbackAnalysis(task);
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return NextResponse.json({ ...fallback, fallback: true });
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
          { role: "user", content: `分析写作任务：${JSON.stringify(task)}。返回 {documentPurpose:string,recommendedStructure:string[],keywords:string[],riskPoints:string[],knowledgeRequirement:(structure|wording|facts|policy|case|format)[]}。recommendedStructure 必须是可供用户确认的完整提纲。` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return NextResponse.json({ ...fallback, fallback: true });
    const payload: unknown = await response.json();
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== "string") return NextResponse.json({ ...fallback, fallback: true });
    let parsed: WritingAnalysis;
    try { parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as WritingAnalysis; }
    catch { return NextResponse.json({ ...fallback, fallback: true }); }
    if (!Array.isArray(parsed.recommendedStructure) || !parsed.recommendedStructure.length || !Array.isArray(parsed.keywords) || !Array.isArray(parsed.riskPoints) || !Array.isArray(parsed.knowledgeRequirement)) {
      return NextResponse.json({ ...fallback, fallback: true });
    }
    parsed.knowledgeRequirement = parsed.knowledgeRequirement.filter((item) => requirementKinds.has(item));
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    console.error("writing-analysis failed", error);
    return NextResponse.json({ error: "任务分析服务暂时不可用" }, { status: 500 });
  }
}
