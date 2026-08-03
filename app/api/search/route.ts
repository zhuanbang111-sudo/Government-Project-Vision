import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { errorMessage } from "../_shared";

type DocumentRow = { id: number; filename: string; department: string | null; doc_type: string | null; content: string; vector_data: string };
const MAX_RESULTS = 8;

function vector(value: string): number[] | null {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.every((item) => typeof item === "number") ? parsed : null; }
  catch { return null; }
}
function similarity(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, aNorm = 0, bNorm = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; aNorm += a[i] ** 2; bNorm += b[i] ** 2; }
  return aNorm && bNorm ? dot / Math.sqrt(aNorm * bNorm) : 0;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const query = (body as { query?: unknown }).query;
    if (typeof query !== "string" || !query.trim()) return NextResponse.json({ error: "搜索词不能为空" }, { status: 400 });
    const key = process.env.ZHIPU_API_KEY;
    if (!key) return NextResponse.json({ error: "未配置 ZHIPU_API_KEY" }, { status: 500 });
    const response = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "embedding-3", input: query.trim().slice(0, 4_000) }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`检索向量服务不可用（${response.status}）`);
    const payload: unknown = await response.json();
    const queryVector = (payload as { data?: Array<{ embedding?: unknown }> }).data?.[0]?.embedding;
    if (!Array.isArray(queryVector) || !queryVector.every((item) => typeof item === "number")) throw new Error("未获得有效检索向量");
    const db = new Database(path.join(process.cwd(), "data", "database.db"));
    let rows: DocumentRow[];
    try { rows = db.prepare("SELECT id, filename, department, doc_type, content, vector_data FROM documents WHERE vector_data IS NOT NULL AND vector_data != ''").all() as DocumentRow[]; }
    finally { db.close(); }
    const results = rows.flatMap((row) => { const itemVector = vector(row.vector_data); if (!itemVector) return []; const score = similarity(queryVector, itemVector); return score > .3 ? [{ id: row.id, filename: row.filename, department: row.department ?? "未分类", doc_type: row.doc_type ?? "未分类", content: row.content.slice(0, 20_000), score: Number(score.toFixed(4)) }] : []; }).sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
    return NextResponse.json(results);
  } catch (error: unknown) { return NextResponse.json({ error: errorMessage(error, "搜索失败") }, { status: 500 }); }
}
