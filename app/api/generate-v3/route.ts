import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

type ParagraphType = { id: number; name: string; description: string };
type ReferenceDocument = { id: number; filename: string; content: string; vector_data: string | null };

const MAX_REFERENCE_DOCUMENTS = 4;
const MAX_REFERENCE_CHARS = 9_000;
const MAX_INPUT_CHARS = 12_000;

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "生成服务发生未知错误";
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return 0;
  let dotProduct = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dotProduct / Math.sqrt(leftNorm * rightNorm) : 0;
}

function readVector(value: string | null) {
  if (!value) return null;
  try {
    const vector: unknown = JSON.parse(value);
    return Array.isArray(vector) && vector.every((item) => typeof item === "number") ? vector : null;
  } catch {
    return null;
  }
}

async function fetchEmbedding(input: string, apiKey: string) {
  const response = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "embedding-3", input: input.slice(0, 4_000) }),
  });
  if (!response.ok) throw new Error(`检索向量服务不可用（${response.status}）`);
  const payload: unknown = await response.json();
  const embedding = (payload as { data?: Array<{ embedding?: unknown }> }).data?.[0]?.embedding;
  if (!Array.isArray(embedding) || !embedding.every((item) => typeof item === "number")) {
    throw new Error("检索向量服务未返回有效结果");
  }
  return embedding;
}

function extractDocument(text: string) {
  const match = text.match(/<official_document>\s*([\s\S]*?)\s*<\/official_document>/i);
  return (match?.[1] ?? text).replace(/<\/?thought_process>/gi, "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const { topic, selectedParagraphs, points, newData = "", selectedIds = [] } = body as {
      topic?: unknown; selectedParagraphs?: unknown; points?: unknown; newData?: unknown; selectedIds?: unknown;
    };

    if (typeof topic !== "string" || !topic.trim() || typeof points !== "string" || !points.trim() || !Array.isArray(selectedParagraphs) || selectedParagraphs.length === 0) {
      return NextResponse.json({ error: "主题、段落结构和写作要点均为必填项" }, { status: 400 });
    }
    const paragraphs = selectedParagraphs.filter((item): item is ParagraphType =>
      typeof item === "object" && item !== null && typeof (item as ParagraphType).id === "number" && typeof (item as ParagraphType).name === "string" && typeof (item as ParagraphType).description === "string",
    );
    if (paragraphs.length !== selectedParagraphs.length) return NextResponse.json({ error: "段落结构格式无效" }, { status: 400 });

    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const zhipuKey = process.env.ZHIPU_API_KEY;
    if (!deepseekKey || !zhipuKey) return NextResponse.json({ error: "生成服务的密钥配置不完整" }, { status: 500 });

    const ids = Array.isArray(selectedIds) ? selectedIds.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
    const db = new Database(path.join(process.cwd(), "data", "database.db"));
    let documents: ReferenceDocument[];
    try {
      if (ids.length > 0) {
        documents = db.prepare(`SELECT id, filename, content, vector_data FROM documents WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as ReferenceDocument[];
      } else {
        documents = db.prepare("SELECT id, filename, content, vector_data FROM documents WHERE vector_data IS NOT NULL AND vector_data != ''").all() as ReferenceDocument[];
      }
    } finally {
      db.close();
    }

    const retrievalQuery = `${topic}\n${points}`.slice(0, MAX_INPUT_CHARS);
    const queryVector = await fetchEmbedding(retrievalQuery, zhipuKey);
    const rankedDocuments = documents
      .map((document) => ({ document, score: cosineSimilarity(queryVector, readVector(document.vector_data) ?? []) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_REFERENCE_DOCUMENTS)
      .map(({ document }) => document);

    let remainingChars = MAX_REFERENCE_CHARS;
    const referenceText = rankedDocuments.map((document, index) => {
      const excerpt = document.content.slice(0, remainingChars);
      remainingChars -= excerpt.length;
      return `【参考材料 ${index + 1}：${document.filename}】\n${excerpt}`;
    }).filter(Boolean).join("\n\n");

    const structure = paragraphs.map((paragraph, index) => `${index + 1}. ${paragraph.name}：${paragraph.description}`).join("\n");
    const systemPrompt = `你是政府材料起草助手。请只输出正式公文正文，不输出分析、推理过程、XML 标签或 Markdown 代码块。
严格遵守：所有具体事实、数字、时间、机构职责和政策依据只能来自“参考材料”或“用户补充数据”；没有依据时使用“【此处需补充具体数据】”。用户补充数据被采用时，在对应句末标注“【用户提供】”。不得虚构来源、文件名或引用。
请按给定段落结构依次成文，段落标题可保留。语言正式、准确、简洁，段落之间衔接自然。`;
    const userPrompt = `【主题】\n${topic.trim()}\n\n【段落结构】\n${structure}\n\n【写作要点】\n${points.trim().slice(0, MAX_INPUT_CHARS)}\n\n【用户补充数据】\n${typeof newData === "string" && newData.trim() ? newData.trim().slice(0, MAX_INPUT_CHARS) : "无"}\n\n【参考材料】\n${referenceText || "无可用参考材料。不得补充未经提供的具体事实。"}`;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deepseekKey}` },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || "deepseek-chat", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1 }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`写作服务不可用（${response.status}）`);
    const payload: unknown = await response.json();
    const text = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("写作服务未返回有效文本");

    const sources = rankedDocuments.map((document, index) => `${index + 1}. [${document.filename}]`).join("\n") || "未使用参考文件";
    const draft = extractDocument(text);
    const referenceIds = rankedDocuments.map((document) => document.id);
    const historyDb = new Database(path.join(process.cwd(), "data", "database.db"));
    try {
      historyDb.prepare("INSERT INTO generations (content, doc_type, topic, reference_ids) VALUES (?, ?, ?, ?)")
        .run(draft, "guided", topic.trim(), JSON.stringify(referenceIds));
    } finally {
      historyDb.close();
    }
    return NextResponse.json({ text: `${draft}\n\n--- 参考来源列表 ---\n${sources}`, referenceIds });
  } catch (error: unknown) {
    console.error("generate-v3 failed:", error);
    return NextResponse.json({ error: asErrorMessage(error) }, { status: 500 });
  }
}
