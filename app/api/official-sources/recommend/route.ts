import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../_platform";
import { getChatCompletionsUrl, getWritingAiSettings } from "../../_settings";
import { isOfficialGovernmentUrl, stripHtml } from "../../_official-sources";

type CoverageItem = { section: string; status: "covered" | "weak" | "missing" };
type SearchPlan = { summary: string; gaps: Array<{ section: string; query: string; reason: string; uses: string[] }> };
type SearchResult = { title: string; url: string; snippet: string };
const MAX_SEARCH_RESPONSE_BYTES = 600_000;

function extractJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match?.[0] ?? cleaned) as unknown;
}

function cleanMarkup(value: string) {
  return stripHtml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
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
    if (total > MAX_SEARCH_RESPONSE_BYTES) { await reader.cancel(); throw new Error("官网索引响应过大"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8").decode(bytes);
}

async function searchGovernmentMetadata(query: string) {
  const searchUrl = new URL("https://cn.bing.com/search");
  searchUrl.searchParams.set("q", `${query} site:gov.cn`.slice(0, 180));
  searchUrl.searchParams.set("cc", "cn");
  searchUrl.searchParams.set("setlang", "zh-Hans");
  const response = await fetch(searchUrl, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; GovernmentWritingAssistant/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`官网索引服务返回 ${response.status}`);
  const html = await readLimitedSearchHtml(response);
  return [...html.matchAll(/<li\s+class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].flatMap((match): SearchResult[] => {
    const heading = match[1].match(/<h2[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
    const title = cleanMarkup(heading?.[2] ?? "");
    const url = cleanMarkup(heading?.[1] ?? "");
    const snippet = cleanMarkup(match[1].match(/<p[^>]*class=["'][^"']*\bb_lineclamp\d*\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    return title && isOfficialGovernmentUrl(url) ? [{ title: title.slice(0, 240), url, snippet: snippet.slice(0, 500) }] : [];
  }).slice(0, 8);
}

function fallbackPlan(topic: string, outline: string[], coverage: CoverageItem[]): SearchPlan {
  const gaps = (coverage.filter((item) => item.status !== "covered").map((item) => item.section).length
    ? coverage.filter((item) => item.status !== "covered").map((item) => item.section)
    : outline.slice(0, 3)).slice(0, 3);
  return {
    summary: `围绕“${topic}”按已确认提纲成文；优先使用已选历史片段，针对依据和事实覆盖不足的章节补充政府官网公开材料。`,
    gaps: gaps.map((section) => ({ section, query: `${topic} ${section} 政策 工作`, reason: `补足“${section}”的政策依据或公开事实`, uses: ["facts", "policy"] })),
  };
}

async function buildSearchPlan(topic: string, documentType: string, outline: string[], coverage: CoverageItem[]) {
  const fallback = fallbackPlan(topic, outline, coverage);
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
          { role: "system", content: "你是政府材料检索规划助手。只输出 JSON。不得编造网址。根据知识库章节覆盖情况，给出简洁写作计划，并为最多3个薄弱章节生成适合检索中国政府部门官网的短查询词。uses 只能从 facts、policy 中选择。" },
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
      if (typeof gap.section !== "string" || typeof gap.query !== "string") return [];
      const uses = Array.isArray(gap.uses) ? gap.uses.filter((use): use is string => use === "facts" || use === "policy") : [];
      return [{ section: gap.section.slice(0, 120), query: gap.query.slice(0, 120), reason: typeof gap.reason === "string" ? gap.reason.slice(0, 200) : `补足“${gap.section}”`, uses: uses.length ? uses : ["facts", "policy"] }];
    }).slice(0, 3) : [];
    return { summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 600) : fallback.summary, gaps: gaps.length ? gaps : fallback.gaps };
  } catch (error) {
    console.warn("Official source planning degraded to deterministic mode", error);
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { topic?: unknown; documentType?: unknown; outline?: unknown; coverage?: unknown };
    if (typeof body.topic !== "string" || !body.topic.trim() || !Array.isArray(body.outline)) {
      return NextResponse.json({ error: "主题和完整提纲不能为空" }, { status: 400 });
    }
    const outline = body.outline.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 20);
    const coverage = Array.isArray(body.coverage) ? body.coverage.flatMap((item): CoverageItem[] => {
      if (!item || typeof item !== "object") return [];
      const value = item as { section?: unknown; status?: unknown };
      return typeof value.section === "string" && (value.status === "covered" || value.status === "weak" || value.status === "missing")
        ? [{ section: value.section.slice(0, 120), status: value.status }] : [];
    }) : [];
    const plan = await buildSearchPlan(body.topic.trim(), typeof body.documentType === "string" ? body.documentType : "政府材料", outline, coverage);
    const broadGap = plan.gaps[0] ?? { section: outline[0] || "全文", query: body.topic.trim(), reason: "补充政府官网公开依据", uses: ["facts", "policy"] };
    const searchTasks = [...plan.gaps, { ...broadGap, query: body.topic.trim().slice(0, 80), reason: `围绕“${body.topic.trim().slice(0, 40)}”补充政府官网公开依据` }];
    const settled = await Promise.allSettled(searchTasks.map((gap) => searchGovernmentMetadata(gap.query)));
    const seen = new Set<string>();
    const candidates = settled.flatMap((result, index) => result.status === "fulfilled" ? result.value.map((item) => ({ ...item, ...searchTasks[index] })) : [])
      .filter((item) => !seen.has(item.url) && Boolean(seen.add(item.url)))
      .slice(0, 6)
      .map((item, index) => ({ id: `official-${index + 1}`, title: item.title, url: item.url, snippet: item.snippet, section: item.section, reason: item.reason, uses: item.uses, sourceType: "政府官网" }));
    return NextResponse.json({ writingPlan: plan.summary, candidates, metadataOnly: true, searchAudit: searchTasks.map((item, index) => ({ query: item.query, resultCount: settled[index].status === "fulfilled" ? settled[index].value.length : 0 })), warning: candidates.length ? null : "暂未检索到可用政府官网候选，您仍可直接生成，系统不会擅自抓取其他网页。" });
  } catch (error) {
    console.error("official source recommendation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "官方素材推荐失败" }, { status: 500 });
  }
}
