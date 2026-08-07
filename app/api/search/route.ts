import { NextRequest, NextResponse } from "next/server";
import { normalizeDocumentType, writingTypeToKnowledgeType } from "../../knowledge";
import { getDatabase } from "../_platform";
import { rankPassagesByOutline, rankReferenceDocuments, type RetrievalDocument } from "../_retrieval";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { query?: unknown; documentType?: unknown; outline?: unknown } | null;
    if (typeof body?.query !== "string" || !body.query.trim()) {
      return NextResponse.json({ error: "搜索词不能为空" }, { status: 400 });
    }
    const preferredType = typeof body.documentType === "string"
      ? writingTypeToKnowledgeType(body.documentType) ?? (/^[a-z_]+$/.test(body.documentType) ? normalizeDocumentType(body.documentType) : null)
      : null;
    const db = await getDatabase();
    const { results: documents } = await db.prepare(
      `SELECT id, filename, content, department, document_type, usage_tags, topic_tags, verification_status, vector_data
       FROM documents WHERE processing_status = 'ready' ORDER BY created_at DESC LIMIT 500`,
    ).all<RetrievalDocument>();
    const ranked = await rankReferenceDocuments({
      documents,
      query: body.query.trim(),
      apiKey: process.env.ZHIPU_API_KEY,
      preferredType,
      limit: Array.isArray(body.outline) ? 14 : 8,
    });
    const outline = Array.isArray(body.outline)
      ? body.outline.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 120)).slice(0, 15)
      : [];
    if (outline.length) {
      const sections = rankPassagesByOutline({ documents: ranked.results, topic: body.query.trim(), outline });
      const passagesByDocument = new Map<number, typeof sections[number]["matches"]>();
      for (const section of sections) {
        for (const match of section.matches) {
          const existing = passagesByDocument.get(match.documentId) ?? [];
          existing.push(match);
          passagesByDocument.set(match.documentId, existing);
        }
      }
      const responseDocuments = ranked.results.flatMap((item) => {
        const passages = passagesByDocument.get(item.id) ?? [];
        if (!passages.length) return [];
        return [{
          id: item.id,
          filename: item.filename,
          department: item.department ?? "未分类",
          documentType: item.document_type,
          usageTags: item.usage_tags,
          verificationStatus: item.verification_status,
          score: Math.max(item.score, ...passages.map((passage) => passage.score)),
          matchReasons: [...new Set(passages.flatMap((passage) => passage.matchReasons))].slice(0, 5),
          coveredSections: [...new Set(passages.map((passage) => passage.section))],
          passages,
        }];
      });
      return NextResponse.json({ documents: responseDocuments, sections, mode: ranked.mode }, { headers: { "X-Search-Mode": ranked.mode } });
    }
    return NextResponse.json(ranked.results.map((item) => ({
      id: item.id,
      filename: item.filename,
      department: item.department ?? "未分类",
      documentType: item.document_type,
      usageTags: item.usage_tags,
      verificationStatus: item.verification_status,
      score: item.score,
      matchReasons: item.matchReasons,
    })), { headers: { "X-Search-Mode": ranked.mode } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "检索服务发生未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
