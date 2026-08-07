import { NextRequest, NextResponse } from "next/server";
import { normalizeUsageTags } from "../../../knowledge";
import { extractOfficialPage, fetchSelectedOfficialPage } from "../../_official-sources";
import { getPlatformEnv } from "../../_platform";
import { rankPassagesByOutline, segmentDocumentContent, type RankedDocument } from "../../_retrieval";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  let uploadedObjectKey = "";
  try {
    const body = await request.json() as { url?: unknown; title?: unknown; topic?: unknown; outline?: unknown; section?: unknown; uses?: unknown };
    if (typeof body.url !== "string") return NextResponse.json({ error: "政府官网链接不能为空" }, { status: 400 });
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
    const outline = Array.isArray(body.outline) ? body.outline.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 20) : [];
    const requestedSection = typeof body.section === "string" ? body.section.trim().slice(0, 120) : "";
    const fetched = await fetchSelectedOfficialPage(body.url);
    const extracted = extractOfficialPage(fetched.text, typeof body.title === "string" ? body.title : "");
    if (extracted.content.length < 100) throw new Error("所选网页未提取到足够的正文内容");
    const contentHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extracted.content)));
    const { APP_DB, DOCUMENTS_BUCKET } = await getPlatformEnv();
    const existing = await APP_DB.prepare(`SELECT id, url, title, publisher, published_at, fetched_at, content_hash, object_key, content
      FROM external_sources WHERE url = ? AND content_hash = ?`).bind(fetched.finalUrl, contentHash).first<{ id: string; fetched_at: string }>();
    const id = existing?.id ?? crypto.randomUUID();
    const fetchedAt = existing?.fetched_at ?? new Date().toISOString();
    if (!existing) {
      uploadedObjectKey = `external-sources/${id}.html`;
      await DOCUMENTS_BUCKET.put(uploadedObjectKey, fetched.bytes.buffer as ArrayBuffer, { httpMetadata: { contentType: fetched.contentType } });
      try {
        await APP_DB.prepare(`INSERT INTO external_sources
          (id, url, title, publisher, published_at, fetched_at, content_hash, object_key, content, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, fetched.finalUrl, extracted.title, extracted.publisher || null, extracted.publishedAt || null, fetchedAt, contentHash, uploadedObjectKey, extracted.content, JSON.stringify({ selectedSection: requestedSection, originalUrl: body.url })).run();
      } catch (error) {
        await DOCUMENTS_BUCKET.delete(uploadedObjectKey);
        uploadedObjectKey = "";
        throw error;
      }
    }
    const fakeDocument: RankedDocument = {
      id: 0, filename: extracted.title, content: extracted.content, department: extracted.publisher || "政府网站",
      document_type: "policy", usage_tags: "[\"facts\",\"policy\"]", topic_tags: "[]", verification_status: "official", vector_data: null,
      score: 0.55, matchReasons: ["政府官网公开来源"],
    };
    const coverage = rankPassagesByOutline({ documents: [fakeDocument], topic, outline: requestedSection ? [requestedSection, ...outline.filter((item) => item !== requestedSection)] : outline, matchesPerSection: 3 });
    const recommended = [...new Map(coverage.flatMap((item) => item.matches).map((item) => [item.passageIndex, item])).values()].slice(0, 6);
    const fallback = segmentDocumentContent(extracted.content, 10).slice(0, 6).map((passage) => ({ ...passage, section: requestedSection || outline[0] || "全文", score: 0, matchReasons: ["政府官网正文"] }));
    const uses = normalizeUsageTags(body.uses).filter((item) => item === "facts" || item === "policy");
    const passages = (recommended.length ? recommended : fallback).map((passage) => ({
      passageIndex: "passageIndex" in passage ? passage.passageIndex : passage.index,
      section: passage.section,
      text: passage.text,
      score: passage.score,
      matchReasons: passage.matchReasons,
      uses: uses.length ? uses : ["facts", "policy"],
    }));
    return NextResponse.json({ source: { id, url: fetched.finalUrl, title: extracted.title, publisher: extracted.publisher || "政府网站", publishedAt: extracted.publishedAt, fetchedAt, contentHash, passages } });
  } catch (error) {
    console.error("selected official source fetch failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "政府官网素材提取失败" }, { status: 500 });
  }
}
