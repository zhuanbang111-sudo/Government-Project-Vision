import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "../_shared";
import type { WritingAnalysis, WritingTask } from "../../../types/writing";

const kinds = new Set(["document", "fact", "policy", "department_rule", "template"]);

export async function POST(request: NextRequest) {
  try {
    const task = await request.json() as Partial<WritingTask>;
    if (!task.title?.trim() || !task.documentType || !task.department?.trim() || !task.purpose?.trim()) return NextResponse.json({ error: "请完整填写任务定义" }, { status: 400 });
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return NextResponse.json({ error: "未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    const response = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || "deepseek-chat", temperature: .1, messages: [{ role: "system", content: "你是政府材料任务分析助手。只返回 JSON，不得虚构政策、数据或职责。" }, { role: "user", content: `分析任务：${JSON.stringify(task)}。返回 {documentPurpose:string,recommendedStructure:string[],keywords:string[],riskPoints:string[],knowledgeRequirement:(document|fact|policy|department_rule|template)[]}。` }] }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`任务分析服务不可用（${response.status}）`);
    const payload: unknown = await response.json();
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("任务分析未返回有效结果");
    const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as WritingAnalysis;
    if (!Array.isArray(parsed.recommendedStructure) || !Array.isArray(parsed.keywords) || !Array.isArray(parsed.riskPoints) || !Array.isArray(parsed.knowledgeRequirement)) throw new Error("任务分析格式无效");
    parsed.knowledgeRequirement = parsed.knowledgeRequirement.filter((item) => kinds.has(item));
    return NextResponse.json(parsed);
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error, "任务分析失败") }, { status: 500 }); }
}
