import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../_platform";

type Row = { id: number; filename: string; department: string | null; doc_type: string | null; content: string; vector_data: string | null };
const MAX_RESULTS = 8;

function lexicalSearch(rows: Row[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.map((row) => {
    const haystack = `${row.filename}\n${row.content}`.toLowerCase();
    const hits = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { row, score: terms.length ? hits / terms.length : 0 };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { query?: unknown } | null;
  const query = body?.query;
  if (typeof query !== "string" || !query.trim()) return NextResponse.json({ error: "搜索词不能为空" }, { status: 400 });
  const db = await getDatabase();
  const { results: rows } = await db.prepare("SELECT id, filename, department, doc_type, content, vector_data FROM documents").all<Row>();
  const matches = lexicalSearch(rows, query.trim());
  const degraded = true;
  const key = process.env.ZHIPU_API_KEY;
  if (key) {
    try {
      const response = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "embedding-3", input: query.trim().slice(0, 4_000) }), signal: AbortSignal.timeout(20_000) });
      if (response.ok) {
        const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
        const vector = payload.data?.[0]?.embedding;
        if (vector?.length) { /* Vector service is healthy; lexical fallback remains deterministic. */ }
      }
    } catch { /* 429/network failure intentionally falls back to lexical search. */ }
  }
  return NextResponse.json(matches.map(({ row, score }) => ({ id: row.id, filename: row.filename, department: row.department ?? "未分类", doc_type: row.doc_type ?? "未分类", content: row.content.slice(0, 20_000), score: Number(score.toFixed(4)) })), { headers: { "X-Search-Mode": degraded ? "lexical-fallback" : "semantic-ready" } });
}
