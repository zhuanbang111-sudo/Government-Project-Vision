import { safeParseList, type KnowledgeDocumentType } from "../knowledge";

export type RetrievalDocument = {
  id: number;
  filename: string;
  content: string;
  department: string | null;
  document_type: string;
  usage_tags: string;
  topic_tags: string;
  verification_status: string;
  vector_data: string | null;
};

export type RankedDocument = RetrievalDocument & { score: number; matchReasons: string[] };

function readVector(value: string | null) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === "number") ? parsed : null;
  } catch {
    return null;
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

function queryTerms(query: string) {
  const chunks = query.toLowerCase().match(/[\p{Script=Han}]{2,20}|[a-z0-9]{2,}/gu) ?? [];
  const terms = new Set<string>();
  for (const chunk of chunks) {
    terms.add(chunk);
    if (/^[\p{Script=Han}]+$/u.test(chunk) && chunk.length > 4) {
      for (let index = 0; index < chunk.length - 1 && terms.size < 40; index += 1) terms.add(chunk.slice(index, index + 2));
    }
  }
  return [...terms].slice(0, 40);
}

function lexicalScore(document: RetrievalDocument, query: string, preferredType?: KnowledgeDocumentType | null) {
  const terms = queryTerms(query);
  const filename = document.filename.toLowerCase();
  const content = document.content.toLowerCase();
  const metadata = `${document.department ?? ""} ${safeParseList(document.topic_tags).join(" ")} ${safeParseList(document.usage_tags).join(" ")}`.toLowerCase();
  let points = 0;
  const reasons = new Set<string>();
  for (const term of terms) {
    if (filename.includes(term)) { points += 3; reasons.add("标题匹配"); }
    if (metadata.includes(term)) { points += 2; reasons.add("标签匹配"); }
    if (content.includes(term)) { points += 1; reasons.add("正文匹配"); }
  }
  const denominator = Math.max(terms.length * 3, 1);
  let score = Math.min(points / denominator, 1);
  if (preferredType && document.document_type === preferredType) { score += 0.2; reasons.add("文种一致"); }
  if (document.verification_status === "verified") { score += 0.05; reasons.add("已人工核验"); }
  return { score: Math.min(score, 1), reasons: [...reasons] };
}

async function fetchEmbedding(input: string, apiKey: string) {
  const response = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "embedding-3", input: input.slice(0, 4_000) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`向量服务返回 ${response.status}`);
  const payload: unknown = await response.json();
  const vector = (payload as { data?: Array<{ embedding?: unknown }> }).data?.[0]?.embedding;
  if (!Array.isArray(vector) || !vector.every((item) => typeof item === "number")) throw new Error("向量服务响应无效");
  return vector;
}

export async function rankReferenceDocuments(options: {
  documents: RetrievalDocument[];
  query: string;
  apiKey?: string;
  preferredType?: KnowledgeDocumentType | null;
  limit?: number;
  includeFallback?: boolean;
}) {
  const { documents, query, apiKey, preferredType = null, limit = 8, includeFallback = false } = options;
  const lexical = documents.map((document) => ({ document, ...lexicalScore(document, query, preferredType) }));
  let queryVector: number[] | null = null;
  let mode: "hybrid" | "lexical" = "lexical";
  if (apiKey && documents.some((document) => readVector(document.vector_data))) {
    try {
      queryVector = await fetchEmbedding(query, apiKey);
      mode = "hybrid";
    } catch (error) {
      console.warn("Vector retrieval degraded to lexical search", error);
    }
  }

  const ranked = lexical.map(({ document, score: textScore, reasons }) => {
    const storedVector = readVector(document.vector_data);
    const vectorScore = queryVector && storedVector ? Math.max(cosineSimilarity(queryVector, storedVector), 0) : 0;
    const score = queryVector && storedVector ? vectorScore * 0.7 + textScore * 0.3 : textScore;
    if (vectorScore > 0) reasons.push("语义相似");
    return { ...document, score: Number(score.toFixed(4)), matchReasons: reasons };
  }).sort((left, right) => right.score - left.score);

  const positive = ranked.filter((item) => item.score > 0);
  return { results: (positive.length || !includeFallback ? positive : ranked).slice(0, limit), mode };
}
