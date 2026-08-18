import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../_platform";
import { getChatCompletionsUrl, getWritingAiSettings } from "../../_settings";
import { isOfficialGovernmentUrl, stripHtml } from "../../_official-sources";
import { isOfficialPageNoise, validateAndStoreOfficialSource, type SelectedOfficialSource } from "../_source-service";

type CoverageItem = { section: string; status: "covered" | "weak" | "missing" };
type SearchGap = { section: string; query: string; reason: string; uses: string[] };
type SearchPlan = { summary: string; gaps: SearchGap[] };
type SearchResult = { title: string; url: string; snippet: string };
type ValidatedCandidate = SearchGap & SearchResult & { source: SelectedOfficialSource; relevanceScore: number };
const MAX_SEARCH_RESPONSE_BYTES = 600_000;

function extractJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match?.[0] ?? cleaned) as unknown;
}

function cleanMarkup(value: string) {
  return stripHtml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function resolveSearchResultUrl(value: string) {
  const cleaned = cleanMarkup(value);
  if (isOfficialGovernmentUrl(cleaned)) return cleaned;
  try {
    const redirect = new URL(cleaned);
    const encoded = redirect.searchParams.get("u") ?? "";
    if (!encoded.startsWith("a1")) return "";
    const base64 = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil((encoded.length - 2) / 4) * 4, "=");
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
    return isOfficialGovernmentUrl(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

async function readLimitedSearchHtml(response: Response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_SEARCH_RESPONSE_BYTES) throw new Error("官网索引响应过大");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SEARCH_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("官网索引响应过大");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function searchGovernmentMetadata(query: string) {
  const searchUrl = new URL("https://cn.bing.com/search");
  searchUrl.searchParams.set("q", `${query} site:gov.cn`.slice(0, 180));
  searchUrl.searchParams.set("cc", "cn");
  searchUrl.searchParams.set("setlang", "zh-Hans");
  searchUrl.searchParams.set("count", "12");
  const response = await fetch(searchUrl, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; GovernmentWritingAssistant/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`官网索引服务返回 ${response.status}`);
  const html = await readLimitedSearchHtml(response);
  return [...html.matchAll(/<li\s+class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].flatMap((match): SearchResult[] => {
    const heading = match[1].match(/<h2[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
    const title = cleanMarkup(heading?.[2] ?? "");
    const url = resolveSearchResultUrl(heading?.[1] ?? "");
    const snippet = cleanMarkup(match[1].match(/<p[^>]*class=["'][^"']*\bb_lineclamp\d*\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    if (!title || !isOfficialGovernmentUrl(url) || isOfficialPageNoise(`${title} ${snippet}`)) return [];
    return [{ title: title.slice(0, 240), url, snippet: snippet.slice(0, 500) }];
  }).slice(0, 4);
}

function fallbackPlan(topic: string, outline: string[], coverage: CoverageItem[]): SearchPlan {
  const uncovered = coverage.filter((item) => item.status !== "covered").map((item) => item.section);
  const gaps = (coverage.length ? uncovered : outline.slice(0, 3)).slice(0, 3);
  return {
    summary: gaps.length
      ? `围绕“${topic}”按已确认提纲成文；历史语料优先，仅对 ${gaps.join("、")} 的依据缺口补充政府官网正文。`
      : `围绕“${topic}”按已确认提纲成文；现有历史语料已覆盖全部章节，无需额外检索。`,
    gaps: gaps.map((section) => ({ section, query: `${topic} ${section} 政策 进展`, reason: `补足“${section}”的政策依据或公开事实`, uses: ["facts", "policy"] })),
  };
}

async function buildSearchPlan(topic: string, documentType: string, outline: string[], coverage: CoverageItem[]) {
  const fallback = fallbackPlan(topic, outline, coverage);
  if (!fallback.gaps.length) return fallback;
  const allowedSections = new Set(fallback.gaps.map((item) => item.section));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return fallback;
  try {
    const db = await getDatabase();
    const settings = await getWritingAiSettings(db);
    const response = await fetch(getChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是政府材料检索规划助手。只输出 JSON，不得编造网址。只能为 coverage 中 weak 或 missing 的章节制定检索，最多3项；查询词应包含主题对象、章节意图和政策或事实限定。uses 只能从 facts、policy 中选择。" },
          { role: "user", content: JSON.stringify({ topic, documentType, outline, coverage }) },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = extractJson(payload.choices?.[0]?.message?.content ?? "") as Partial<SearchPlan>;
    const gaps = Array.isArray(parsed.gaps) ? parsed.gaps.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const gap = item as { section?: unknown; query?: unknown; reason?: unknown; uses?: unknown };
      if (typeof gap.section !== "string" || typeof gap.query !== "string" || !allowedSections.has(gap.section)) return [];
      const uses = Array.isArray(gap.uses) ? gap.uses.filter((use): use is string => use === "facts" || use === "policy") : [];
      return [{ section: gap.section.slice(0, 120), query: gap.query.slice(0, 120), reason: typeof gap.reason === "string" ? gap.reason.slice(0, 200) : `补足“${gap.section}”`, uses: uses.length ? uses : ["facts", "policy"] }];
    }).slice(0, 3) : [];
    return { summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 600) : fallback.summary, gaps: gaps.length ? gaps : fallback.gaps };
  } catch (error) {
    console.warn(JSON.stringify({ message: "official source planning degraded", error: error instanceof Error ? error.message : String(error) }));
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { topic?: unknown; documentType?: unknown; outline?: unknown; coverage?: unknown };
    if (typeof body.topic !== "string" || !body.topic.trim() || !Array.isArray(body.outline)) return NextResponse.json({ error: "主题和完整提纲不能为空" }, { status: 400 });
    const topic = body.topic.trim().slice(0, 300);
    const outline = body.outline.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 20);
    const coverage = Array.isArray(body.coverage) ? body.coverage.flatMap((item): CoverageItem[] => {
      if (!item || typeof item !== "object") return [];
      const value = item as { section?: unknown; status?: unknown };
      return typeof value.section === "string" && (value.status === "covered" || value.status === "weak" || value.status === "missing") ? [{ section: value.section.slice(0, 120), status: value.status }] : [];
    }) : [];
    const plan = await buildSearchPlan(topic, typeof body.documentType === "string" ? body.documentType : "政府材料", outline, coverage);
    if (!plan.gaps.length) {
      return NextResponse.json({ writingPlan: plan.summary, candidates: [], autoSelectedSources: [], sections: outline.map((section) => ({ section, localStatus: coverage.find((item) => item.section === section)?.status ?? "covered", externalStatus: "not-needed", sourceIds: [] })), searchAudit: [], warning: null });
    }

    const searchSettled = await Promise.allSettled(plan.gaps.map((gap) => searchGovernmentMetadata(gap.query)));
    const seen = new Set<string>();
    const metadata = searchSettled.flatMap((result, index) => result.status === "fulfilled" ? result.value.slice(0, 2).map((item) => ({ ...item, ...plan.gaps[index] })) : [])
      .filter((item) => !seen.has(item.url) && Boolean(seen.add(item.url))).slice(0, 6);
    const validationSettled = await Promise.allSettled(metadata.map(async (item): Promise<ValidatedCandidate> => {
      const validated = await validateAndStoreOfficialSource({ url: item.url, fallbackTitle: item.title, topic, outline, section: item.section, uses: item.uses });
      return { ...item, ...validated };
    }));
    const validated = validationSettled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const bestBySection = new Map<string, ValidatedCandidate>();
    for (const item of validated.sort((left, right) => right.relevanceScore - left.relevanceScore)) if (!bestBySection.has(item.section)) bestBySection.set(item.section, item);
    const autoSelected = [...bestBySection.values()].slice(0, 3);
    const autoIds = new Set(autoSelected.map((item) => item.source.id));
    const candidates = validated.filter((item) => !autoIds.has(item.source.id)).map((item) => ({
      id: item.source.id, title: item.source.title, url: item.source.url, publisher: item.source.publisher, publishedAt: item.source.publishedAt,
      section: item.section, reason: item.reason, uses: item.uses, relevanceScore: item.relevanceScore,
      excerpt: item.source.passages.find((passage) => passage.section === item.section)?.text ?? item.source.passages[0]?.text ?? "",
      source: item.source, sourceType: "政府官网" as const,
    }));
    const sections = outline.map((section) => {
      const localStatus = coverage.find((item) => item.section === section)?.status ?? "missing";
      const selected = autoSelected.filter((item) => item.section === section);
      const wasGap = plan.gaps.some((item) => item.section === section);
      return { section, localStatus, externalStatus: !wasGap ? "not-needed" : selected.length ? "supplemented" : "unresolved", sourceIds: selected.map((item) => item.source.id) };
    });
    const unresolved = sections.filter((item) => item.externalStatus === "unresolved").map((item) => item.section);
    return NextResponse.json({
      writingPlan: plan.summary, candidates, autoSelectedSources: autoSelected.map((item) => item.source), sections,
      searchAudit: plan.gaps.map((gap, index) => ({ section: gap.section, query: gap.query, indexedCount: searchSettled[index].status === "fulfilled" ? searchSettled[index].value.length : 0, validatedCount: validated.filter((item) => item.section === gap.section).length })),
      rejectedCount: validationSettled.filter((item) => item.status === "rejected").length,
      warning: unresolved.length ? `“${unresolved.join("、")}”未找到足够相关且可核验的政府官网正文，系统将保留待核验提示，不会用无关网页填充。` : null,
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "official source recommendation failed", error: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: error instanceof Error ? error.message : "官方素材推荐失败" }, { status: 500 });
  }
}
