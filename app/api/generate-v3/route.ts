import { NextRequest, NextResponse } from "next/server";
import { documentTypeLabel, normalizeUsageTags, safeParseList, usageTagLabel, writingTypeToKnowledgeType } from "../../knowledge";
import { getDatabase, placeholders } from "../_platform";
import { loadExternalReferencePassages, parseExternalReferences } from "../_official-sources";
import { rankReferenceDocuments, segmentDocumentContent, type RetrievalDocument } from "../_retrieval";
import { getChatCompletionsUrl, getWritingAiSettings } from "../_settings";

type ParagraphType = { id: number; name: string; description: string };
const MAX_REFERENCE_DOCUMENTS = 6;
const MAX_REFERENCE_PASSAGES = 24;
const MAX_REFERENCE_CHARS = 12_000;
const MAX_INPUT_CHARS = 12_000;

class ProviderError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function extractDocument(text: string) {
  const match = text.match(/<official_document>\s*([\s\S]*?)\s*<\/official_document>/i);
  return (match?.[1] ?? text).replace(/<\/?thought_process>/gi, "").trim();
}

type SelectedReference = {
  documentId: number;
  passageIndex: number;
  section: string;
  uses: string[];
};

function parseSelectedReferences(value: unknown): SelectedReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { documentId?: unknown; passageIndex?: unknown; section?: unknown; uses?: unknown };
    if (!Number.isInteger(candidate.documentId) || Number(candidate.documentId) <= 0 || !Number.isInteger(candidate.passageIndex) || Number(candidate.passageIndex) < 0) return [];
    return [{
      documentId: Number(candidate.documentId),
      passageIndex: Number(candidate.passageIndex),
      section: typeof candidate.section === "string" ? candidate.section.trim().slice(0, 120) : "未指定章节",
      uses: normalizeUsageTags(candidate.uses),
    }];
  }).slice(0, MAX_REFERENCE_PASSAGES);
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const { topic, selectedParagraphs, points = "", newData = "", selectedIds, selectedReferences, externalReferences, documentType = "", documentSubtype = "", knowledgeRequirements = [] } = body as {
      topic?: unknown;
      selectedParagraphs?: unknown;
      points?: unknown;
      newData?: unknown;
      selectedIds?: unknown;
      selectedReferences?: unknown;
      externalReferences?: unknown;
      documentType?: unknown;
      documentSubtype?: unknown;
      knowledgeRequirements?: unknown;
    };
    if (typeof topic !== "string" || !topic.trim() || typeof points !== "string" || !Array.isArray(selectedParagraphs) || !selectedParagraphs.length) {
      return NextResponse.json({ error: "主题和完整提纲为必填项" }, { status: 400 });
    }
    const paragraphs = selectedParagraphs.filter((item): item is ParagraphType =>
      typeof item === "object" && item !== null
      && typeof (item as ParagraphType).id === "number"
      && typeof (item as ParagraphType).name === "string"
      && typeof (item as ParagraphType).description === "string",
    );
    if (paragraphs.length !== selectedParagraphs.length) return NextResponse.json({ error: "提纲结构格式无效" }, { status: 400 });
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return NextResponse.json({ error: "尚未配置写作模型密钥 DEEPSEEK_API_KEY" }, { status: 500 });

    const passageSelectionProvided = Array.isArray(selectedReferences);
    const passageSelections = parseSelectedReferences(selectedReferences);
    const selectedIdsProvided = passageSelectionProvided || Array.isArray(selectedIds);
    const ids = passageSelectionProvided
      ? [...new Set(passageSelections.map((item) => item.documentId))]
      : Array.isArray(selectedIds) ? selectedIds.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
    const preferredType = typeof documentType === "string" ? writingTypeToKnowledgeType(documentType) : null;
    const requiredUses = Array.isArray(knowledgeRequirements)
      ? knowledgeRequirements.filter((item): item is string => typeof item === "string")
      : [];
    const db = await getDatabase();
    const aiSettings = await getWritingAiSettings(db);
    const selectSql = `SELECT id, filename, content, department, document_type, usage_tags, topic_tags,
      verification_status, vector_data FROM documents WHERE processing_status = 'ready'`;
    const documents = selectedIdsProvided
      ? ids.length
        ? (await db.prepare(`${selectSql} AND id IN (${placeholders(ids)})`).bind(...ids).all<RetrievalDocument>()).results
        : []
      : (await db.prepare(`${selectSql} ORDER BY verification_status DESC, created_at DESC LIMIT 500`).all<RetrievalDocument>()).results;
    const requestedExternalReferences = parseExternalReferences(externalReferences);

    const retrievalQuery = `${topic}\n${documentType}\n${documentSubtype}\n${points}\n${requiredUses.join(" ")}`.slice(0, MAX_INPUT_CHARS);
    const ranked = passageSelectionProvided ? null : await rankReferenceDocuments({
      documents,
      query: retrievalQuery,
      apiKey: process.env.ZHIPU_API_KEY,
      preferredType,
      limit: MAX_REFERENCE_DOCUMENTS,
      includeFallback: ids.length > 0,
    });
    const references = ranked?.results ?? documents;
    const localReferenceBudget = requestedExternalReferences.length ? 8_000 : MAX_REFERENCE_CHARS;
    let remainingChars = localReferenceBudget;
    const sourceEntries: Array<{ id: number | string; kind: "knowledge" | "official-web"; marker: string; filename: string; verified: boolean; passageIndex?: number; section?: string; excerpt?: string; uses?: string[]; url?: string; publisher?: string; fetchedAt?: string; contentHash?: string }> = [];
    let referenceText = "";
    if (passageSelectionProvided) {
      const byId = new Map(references.map((document) => [document.id, document]));
      const documentNumbers = new Map<number, number>();
      const passageNumbers = new Map<number, number>();
      const blocks: string[] = [];
      for (const selection of passageSelections) {
        if (remainingChars <= 0) break;
        const document = byId.get(selection.documentId);
        const passage = document ? segmentDocumentContent(document.content).find((item) => item.index === selection.passageIndex) : null;
        if (!document || !passage) continue;
        if (!documentNumbers.has(document.id)) documentNumbers.set(document.id, documentNumbers.size + 1);
        const documentNumber = documentNumbers.get(document.id) ?? 1;
        const passageNumber = (passageNumbers.get(document.id) ?? 0) + 1;
        passageNumbers.set(document.id, passageNumber);
        const marker = `来源${documentNumber}-片段${passageNumber}`;
        const excerpt = passage.text.slice(0, remainingChars);
        remainingChars -= excerpt.length;
        const uses = selection.uses.length ? selection.uses : normalizeUsageTags(document.usage_tags);
        blocks.push(`【${marker}】${document.filename}\n适用章节：${selection.section || "未指定"}；指定用途：${uses.map(usageTagLabel).join("、") || "通用参考"}；核验状态：${document.verification_status === "verified" ? "已核验" : "未核验"}\n${excerpt}`);
        sourceEntries.push({ id: document.id, kind: "knowledge", marker, filename: document.filename, verified: document.verification_status === "verified", passageIndex: passage.index, section: selection.section, excerpt: excerpt.slice(0, 180), uses });
      }
      if (passageSelections.length && !sourceEntries.length) return NextResponse.json({ error: "所选引用片段已失效，请返回第二步重新检索" }, { status: 400 });
      referenceText = blocks.join("\n\n");
    } else {
      referenceText = references.map((document, index) => {
        if (remainingChars <= 0) return "";
        const excerpt = document.content.slice(0, remainingChars);
        remainingChars -= excerpt.length;
        const uses = safeParseList(document.usage_tags).map(usageTagLabel).join("、") || "通用参考";
        const tags = safeParseList(document.topic_tags).join("、") || "无";
        sourceEntries.push({ id: document.id, kind: "knowledge", marker: `来源${index + 1}`, filename: document.filename, verified: document.verification_status === "verified" });
        return `【来源${index + 1}】${document.filename}\n文种：${documentTypeLabel(document.document_type)}；用途：${uses}；主题标签：${tags}；核验状态：${document.verification_status === "verified" ? "已核验" : "未核验"}\n${excerpt}`;
      }).filter(Boolean).join("\n\n");
    }

    const localCharsUsed = localReferenceBudget - remainingChars;
    remainingChars = MAX_REFERENCE_CHARS - localCharsUsed;
    const externalPassages = await loadExternalReferencePassages(externalReferences);
    if (requestedExternalReferences.length && externalPassages.length !== requestedExternalReferences.length) {
      return NextResponse.json({ error: "所选政府官网引用片段已失效，请在第三步重新选用" }, { status: 400 });
    }
    if (externalPassages.length && remainingChars > 0) {
      const sourceNumbers = new Map<string, number>();
      const passageNumbers = new Map<string, number>();
      const blocks: string[] = [];
      for (const item of externalPassages) {
        if (remainingChars <= 0) break;
        if (!sourceNumbers.has(item.source.id)) sourceNumbers.set(item.source.id, sourceNumbers.size + 1);
        const sourceNumber = sourceNumbers.get(item.source.id) ?? 1;
        const passageNumber = (passageNumbers.get(item.source.id) ?? 0) + 1;
        passageNumbers.set(item.source.id, passageNumber);
        const marker = `外部来源${sourceNumber}-片段${passageNumber}`;
        const excerpt = item.passage.text.slice(0, remainingChars);
        remainingChars -= excerpt.length;
        const uses = item.selection.uses.filter((use) => use === "facts" || use === "policy");
        blocks.push(`【${marker}】${item.source.title}\n发布单位：${item.source.publisher || "政府网站"}；官网链接：${item.source.url}；适用章节：${item.selection.section}；指定用途：${uses.map(usageTagLabel).join("、") || "事实、政策依据"}\n${excerpt}`);
        sourceEntries.push({ id: item.source.id, kind: "official-web", marker, filename: item.source.title, verified: true, passageIndex: item.passage.index, section: item.selection.section, excerpt: excerpt.slice(0, 180), uses: uses.length ? uses : ["facts", "policy"], url: item.source.url, publisher: item.source.publisher || undefined, fetchedAt: item.source.fetched_at, contentHash: item.source.content_hash });
      }
      referenceText = [referenceText, blocks.join("\n\n")].filter(Boolean).join("\n\n");
    }

    const structure = paragraphs.map((paragraph, index) => `${index + 1}. ${paragraph.name}：${paragraph.description}`).join("\n");
    const systemPrompt = `你是政府材料起草助手。只输出正式公文正文，不输出分析过程、XML 或 Markdown 代码块。
严格遵守以下规则：
1. 按用户已经确认的完整提纲依次成文，不擅自改变章节结构。
2. 具体事实、数字、时间、机构职责和政策依据只能来自参考材料或用户补充数据。
3. 使用参考材料中的事实、数据或政策依据时，在对应句末原样标注材料给出的【来源N】、【来源N-片段M】或【外部来源N-片段M】；同一句可引用多个来源。
4. 使用用户补充数据时标注【用户提供】；缺少必要数据时写【此处需补充具体数据】。
5. 只能模仿参考材料的结构和正式措辞，不得复制与当前主题无关的事实，不得虚构来源。
6. 已核验来源优先作为事实和政策依据；未核验来源只能作为待核查参考。
7. 每个片段只能按照“指定用途”使用；仅标记为结构或措辞参考的片段，不得作为事实或政策依据。
语言应正式、准确、简洁，层级编号规范，段落衔接自然。`;
    const userPrompt = `【材料主题】\n${topic.trim()}\n\n【目标文种】\n${typeof documentType === "string" ? documentType : "政府材料"}${typeof documentSubtype === "string" && documentSubtype ? `（${documentSubtype}）` : ""}\n\n【已确认完整提纲】\n${structure}\n\n【写作要点】\n${points.trim().slice(0, MAX_INPUT_CHARS)}\n\n【用户补充数据】\n${typeof newData === "string" && newData.trim() ? newData.trim().slice(0, MAX_INPUT_CHARS) : "无"}\n\n【本次所需知识】\n${requiredUses.join("、") || "结构、措辞、事实和政策依据"}\n\n【参考材料】\n${referenceText || "无可用参考材料。不得补充未经提供的具体事实。"}`;

    const response = await fetch(getChatCompletionsUrl(aiSettings.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deepseekKey}` },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new ProviderError(`写作服务返回 ${response.status}`, response.status);
    const payload: unknown = await response.json();
    const text = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("写作服务未返回有效文本");

    const draft = extractDocument(text);
    const referenceIds = [...new Set(sourceEntries.filter((source) => source.kind === "knowledge").map((source) => source.id as number))];
    const sources = sourceEntries.map((source) => `${source.marker}. [${source.filename}]${source.publisher ? `｜${source.publisher}` : ""}${source.passageIndex !== undefined ? `｜原文第${source.passageIndex + 1}段` : ""}${source.section ? `｜用于“${source.section}”` : ""}${source.url ? `｜${source.url}` : ""}（${source.verified ? "已核验" : "未核验"}）`).join("\n") || "未使用参考文件";
    await db.prepare("INSERT INTO generations (content, doc_type, topic, reference_ids) VALUES (?, ?, ?, ?)")
      .bind(draft, typeof documentType === "string" && documentType ? documentType : "guided", topic.trim(), JSON.stringify(sourceEntries)).run();
    return NextResponse.json({
      text: `${draft}\n\n--- 参考来源列表 ---\n${sources}`,
      referenceIds,
      retrievalMode: passageSelectionProvided ? "selected-passages" : ranked?.mode ?? "lexical",
      sources: sourceEntries,
      referenceAudit: sourceEntries,
    });
  } catch (error: unknown) {
    console.error("generate-v3 failed", error);
    if (error instanceof ProviderError) {
      const status = error.status === 429 ? 429 : 503;
      return NextResponse.json({ error: error.message, retryable: true }, { status });
    }
    const message = error instanceof Error ? error.message : "生成服务发生未知错误";
    const unavailable = error instanceof DOMException || /超时|fetch|network|ECONN|ENOTFOUND/i.test(message);
    return NextResponse.json({ error: message, retryable: unavailable }, { status: unavailable ? 503 : 500 });
  }
}
