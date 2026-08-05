import { NextRequest, NextResponse } from "next/server";
import { getDatabase, placeholders } from "../_platform";

export async function POST(request: NextRequest) {
  try {
    const { draftContent, selectedIds } = await request.json() as { draftContent?: unknown; selectedIds?: unknown };
    if (typeof draftContent !== "string" || !draftContent.trim()) return NextResponse.json({ error: "草稿内容不能为空" }, { status: 400 });
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    const ids = Array.isArray(selectedIds) ? selectedIds.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
    const db = await getDatabase();
    const references = ids.length
      ? (await db.prepare(`SELECT filename, content FROM documents WHERE id IN (${placeholders(ids)})`).bind(...ids).all<{ filename: string; content: string }>()).results
      : [];
    const sourceText = references.map((document) => `[${document.filename}]\n${document.content.slice(0, 6000)}`).join("\n\n") || "未选择参考材料";
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || "deepseek-chat", temperature: 0.1, messages: [
        { role: "system", content: "你是政府材料合规审查助手。只返回 JSON 数组，每项包含 dimension、fragment、description。仅标出无法由参考材料支持的事实、数据、时间、政策或明显逻辑矛盾。" },
        { role: "user", content: `【参考材料】\n${sourceText}\n\n【待审草稿】\n${draftContent.slice(0, 30000)}` },
      ] }), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`审查服务不可用（${response.status}）`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content?.replace(/^```json\s*|```$/g, "").trim() || "[]";
    return NextResponse.json(JSON.parse(raw));
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "审查服务错误" }, { status: 500 });
  }
}
