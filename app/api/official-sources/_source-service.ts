import { normalizeUsageTags } from "../../knowledge";
import { extractOfficialPage, fetchSelectedOfficialPage } from "../_official-sources";
import { getPlatformEnv } from "../_platform";
import { rankPassagesByOutline, type RankedDocument } from "../_retrieval";

const PAGE_NOISE = /(ICP备案|ICP备\d|公网安备|增值电信业务经营许可证|隐私与\s*Cookie|网站地图|登录|注册|搜索结果|无障碍浏览|联系我们)/iu;
const MIN_ARTICLE_LENGTH = 300;

export type SelectedOfficialSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
  passages: Array<{
    passageIndex: number;
    section: string;
    text: string;
    score: number;
    matchReasons: string[];
    uses: Array<"facts" | "policy">;
  }>;
};

export class OfficialSourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialSourceValidationError";
  }
}

export function isOfficialPageNoise(value: string) {
  return PAGE_NOISE.test(value.replace(/\s+/g, " "));
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function validateAndStoreOfficialSource(options: {
  url: string;
  fallbackTitle?: string;
  topic: string;
  outline: string[];
  section: string;
  uses: unknown;
}) {
  const fetched = await fetchSelectedOfficialPage(options.url);
  const extracted = extractOfficialPage(fetched.text, options.fallbackTitle);
  if (extracted.content.length < MIN_ARTICLE_LENGTH) {
    throw new OfficialSourceValidationError("该页面没有提取到足够的文章正文");
  }
  if (extracted.title.length < 6 || isOfficialPageNoise(extracted.title)) {
    throw new OfficialSourceValidationError("该链接不是可引用的政府正文页面");
  }

  const requestedOutline = options.section
    ? [options.section, ...options.outline.filter((item) => item !== options.section)]
    : options.outline;
  const fakeDocument: RankedDocument = {
    id: 0,
    filename: extracted.title,
    content: extracted.content,
    department: extracted.publisher || "政府网站",
    document_type: "policy",
    usage_tags: "[\"facts\",\"policy\"]",
    topic_tags: "[]",
    verification_status: "official",
    vector_data: null,
    score: 0.55,
    matchReasons: ["政府官网正文已验证"],
  };
  const coverage = rankPassagesByOutline({
    documents: [fakeDocument],
    topic: options.topic,
    outline: requestedOutline.length ? requestedOutline : [options.section || "全文"],
    matchesPerSection: 3,
  });
  const requestedCoverage = coverage.find((item) => item.section === options.section) ?? coverage[0];
  if (!requestedCoverage?.matches.length) {
    throw new OfficialSourceValidationError("正文与当前写作主题或待补章节不相关");
  }
  const topScore = requestedCoverage.matches[0]?.score ?? 0;
  if (topScore < 0.08) {
    throw new OfficialSourceValidationError("正文与待补章节的相关度不足");
  }

  const uniquePassages = [...new Map(coverage.flatMap((item) => item.matches).map((item) => [item.passageIndex, item])).values()]
    .filter((item) => item.score >= 0.08)
    .slice(0, 6);
  const requestedUses = normalizeUsageTags(options.uses).filter((item): item is "facts" | "policy" => item === "facts" || item === "policy");
  const uses = requestedUses.length ? requestedUses : ["facts", "policy"] as Array<"facts" | "policy">;
  const contentHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extracted.content)));
  const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
  const existing = await APP_DB.prepare(`SELECT id, fetched_at FROM external_sources WHERE url = ? AND content_hash = ?`)
    .bind(fetched.finalUrl, contentHash)
    .first<{ id: string; fetched_at: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const fetchedAt = existing?.fetched_at ?? new Date().toISOString();

  if (!existing) {
    const objectKey = `external-sources/${id}.html`;
    await DOCUMENTS_BUCKET.put(objectKey, toArrayBuffer(fetched.bytes), { httpMetadata: { contentType: fetched.contentType } });
    try {
      await APP_DB.prepare(`INSERT INTO external_sources
        (id, url, title, publisher, published_at, fetched_at, content_hash, object_key, content, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id,
          fetched.finalUrl,
          extracted.title,
          extracted.publisher || null,
          extracted.publishedAt || null,
          fetchedAt,
          contentHash,
          objectKey,
          extracted.content,
          JSON.stringify({ selectedSection: options.section, originalUrl: options.url, validationScore: topScore }),
        )
        .run();
    } catch (error) {
      await DOCUMENTS_BUCKET.delete(objectKey);
      throw error;
    }
  }

  const source: SelectedOfficialSource = {
    id,
    url: fetched.finalUrl,
    title: extracted.title,
    publisher: extracted.publisher || new URL(fetched.finalUrl).hostname,
    publishedAt: extracted.publishedAt,
    fetchedAt,
    contentHash,
    passages: uniquePassages.map((passage) => ({
      passageIndex: passage.passageIndex,
      section: passage.section,
      text: passage.text,
      score: passage.score,
      matchReasons: passage.matchReasons,
      uses,
    })),
  };
  return { source, relevanceScore: topScore };
}
