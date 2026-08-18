import { normalizeUsageTags } from "../knowledge";
import { getDatabase, placeholders } from "./_platform";
import { segmentDocumentContent } from "./_retrieval";

const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

export type ExternalSourceRow = {
  id: string;
  url: string;
  title: string;
  publisher: string | null;
  published_at: string | null;
  fetched_at: string;
  content_hash: string;
  object_key: string;
  content: string;
};

export type ExternalReferenceSelection = {
  sourceId: string;
  passageIndex: number;
  section: string;
  uses: string[];
};

export function isOfficialGovernmentUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (hostname === "gov.cn" || hostname.endsWith(".gov.cn"));
  } catch {
    return false;
  }
}

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

export function stripHtml(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const direct = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"));
    const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"));
    const result = direct?.[1] ?? reverse?.[1];
    if (result) return stripHtml(result);
  }
  return "";
}

export function extractOfficialPage(html: string, fallbackTitle = "") {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const main = withoutNoise.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? withoutNoise.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? withoutNoise;
  const content = decodeEntities(main
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const rawTitle = metaContent(html, ["og:title", "ArticleTitle", "title"])
    || stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    || fallbackTitle;
  const title = rawTitle.replace(/\s*[-_|｜].*?政府.*$/u, "").trim().slice(0, 240) || "政府网站公开资料";
  const publisher = metaContent(html, ["source", "SiteName", "og:site_name", "author"]).slice(0, 120);
  const publishedAt = metaContent(html, ["PubDate", "publishdate", "publishDate", "article:published_time", "date"])
    || html.match(/(?:发布时间|发布日期|成文日期)[：:]?\s*(\d{4}[年\-/]\d{1,2}[月\-/]\d{1,2}日?)/)?.[1]
    || "";
  return { title, publisher, publishedAt: publishedAt.slice(0, 40), content };
}

async function readLimitedBody(response: Response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_HTML_BYTES) throw new Error("所选网页超过 1.5MB，暂不支持提取");
  if (!response.body) throw new Error("所选网页未返回正文");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("所选网页超过 1.5MB，暂不支持提取");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(response.headers.get("content-type") || "")?.[1] || "utf-8";
  let text = "";
  try { text = new TextDecoder(charset).decode(bytes); } catch { text = new TextDecoder("utf-8").decode(bytes); }
  return { bytes, text };
}

export async function fetchSelectedOfficialPage(initialUrl: string) {
  if (!isOfficialGovernmentUrl(initialUrl)) throw new Error("仅允许提取使用 HTTPS 的中国政府部门官网（.gov.cn）链接");
  let current = new URL(initialUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "GovernmentWritingAssistant/1.0", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("所选官网链接重定向异常");
      const next = new URL(location, current);
      if (!isOfficialGovernmentUrl(next.toString())) throw new Error("所选官网链接跳转到了非政府网站，已阻止提取");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`所选政府网页返回 ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error("当前仅支持提取政府网站 HTML 正文");
    const body = await readLimitedBody(response);
    return { ...body, finalUrl: current.toString(), contentType };
  }
  throw new Error("所选官网链接重定向次数过多");
}

export function parseExternalReferences(value: unknown, limit = 18): ExternalReferenceSelection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { sourceId?: unknown; passageIndex?: unknown; section?: unknown; uses?: unknown };
    if (typeof candidate.sourceId !== "string" || !/^[0-9a-f-]{20,50}$/i.test(candidate.sourceId)
      || !Number.isInteger(candidate.passageIndex) || Number(candidate.passageIndex) < 0) return [];
    return [{
      sourceId: candidate.sourceId,
      passageIndex: Number(candidate.passageIndex),
      section: typeof candidate.section === "string" ? candidate.section.trim().slice(0, 120) : "未指定章节",
      uses: normalizeUsageTags(candidate.uses),
    }];
  }).slice(0, limit);
}

export async function loadExternalReferencePassages(value: unknown) {
  const selections = parseExternalReferences(value);
  const ids = [...new Set(selections.map((item) => item.sourceId))];
  if (!ids.length) return [];
  const db = await getDatabase();
  const rows = (await db.prepare(`SELECT id, url, title, publisher, published_at, fetched_at, content_hash, object_key, content
    FROM external_sources WHERE id IN (${placeholders(ids)})`).bind(...ids).all<ExternalSourceRow>()).results;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return selections.flatMap((selection) => {
    const source = byId.get(selection.sourceId);
    const passage = source ? segmentDocumentContent(source.content).find((item) => item.index === selection.passageIndex) : null;
    return source && passage ? [{ selection, source, passage }] : [];
  });
}
