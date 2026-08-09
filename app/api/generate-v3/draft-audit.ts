import type { DraftAudit, DraftSectionAudit } from "../../../types/writing";

export type DraftSourceEntry = {
  id: number | string;
  kind: "knowledge" | "official-web";
  marker: string;
  filename: string;
  verified: boolean;
  passageIndex?: number;
  section?: string;
  excerpt?: string;
  uses?: string[];
  url?: string;
  publisher?: string;
  fetchedAt?: string;
  contentHash?: string;
};

type OutlineParagraph = { name: string };
const SOURCE_MARKER_PATTERN = /【((?:外部)?来源\d+(?:-片段\d+)?)】/g;

function normalizeHeading(value: string) {
  return value
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[一二三四五六七八九十百]+[、.．]\s*/, "")
    .replace(/^（[一二三四五六七八九十百]+）\s*/, "")
    .replace(/^\d+[、.．]\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

function findSectionBlocks(draft: string, paragraphs: OutlineParagraph[]) {
  const lines = draft.split(/\r?\n/);
  let searchFrom = 0;
  const headings = paragraphs.map((paragraph) => {
    const target = normalizeHeading(paragraph.name);
    const relativeIndex = lines.slice(searchFrom).findIndex((line) => {
      const normalized = normalizeHeading(line);
      return normalized === target || (normalized.endsWith(target) && normalized.length <= target.length + 8);
    });
    const lineIndex = relativeIndex < 0 ? -1 : searchFrom + relativeIndex;
    if (lineIndex >= 0) searchFrom = lineIndex + 1;
    return { title: paragraph.name, lineIndex };
  });
  return headings.map((heading) => {
    if (heading.lineIndex < 0) return { title: heading.title, content: "" };
    const nextIndex = headings
      .filter((candidate) => candidate.lineIndex > heading.lineIndex)
      .reduce((minimum, candidate) => Math.min(minimum, candidate.lineIndex), lines.length);
    return { title: heading.title, content: lines.slice(heading.lineIndex, nextIndex).join("\n").trim() };
  });
}

export function buildDraftAudit(draft: string, paragraphs: OutlineParagraph[], sourceEntries: DraftSourceEntry[]): DraftAudit {
  const sourceByMarker = new Map(sourceEntries.map((source) => [source.marker, source]));
  const sections: DraftSectionAudit[] = findSectionBlocks(draft, paragraphs).map((block) => {
    const citations = [...new Set([...block.content.matchAll(SOURCE_MARKER_PATTERN)].map((match) => match[1]))];
    const verifiedCitations = citations.filter((marker) => sourceByMarker.get(marker)?.verified);
    const unverifiedCitations = citations.filter((marker) => sourceByMarker.has(marker) && !sourceByMarker.get(marker)?.verified);
    const missingDataCount = (block.content.match(/【此处需补充具体数据】/g) ?? []).length;
    const usesUserData = block.content.includes("【用户提供】");
    const hasInvalidCitation = citations.some((marker) => !sourceByMarker.has(marker));
    const status: DraftSectionAudit["status"] = !block.content
      ? "missing"
      : missingDataCount > 0 || unverifiedCitations.length > 0 || hasInvalidCitation
        ? "pending"
        : citations.length > 0 || usesUserData
          ? "supported"
          : "narrative";
    return { title: block.title, status, citations, verifiedCitations, unverifiedCitations, usesUserData, missingDataCount };
  });
  const allCitations = [...new Set([...draft.matchAll(SOURCE_MARKER_PATTERN)].map((match) => match[1]))];
  const invalidCitations = allCitations.filter((marker) => !sourceByMarker.has(marker));
  const missingDataCount = (draft.match(/【此处需补充具体数据】/g) ?? []).length;
  const missingSections = sections.filter((section) => section.status === "missing").length;
  const narrativeSections = sections.filter((section) => section.status === "narrative").length;
  const unverifiedCitationCount = allCitations.filter((marker) => sourceByMarker.has(marker) && !sourceByMarker.get(marker)?.verified).length;
  const notices: string[] = [];
  if (missingSections) notices.push(`${missingSections} 个提纲章节未被识别，请检查草稿是否完整。`);
  if (missingDataCount) notices.push(`${missingDataCount} 处具体数据仍需补充。`);
  if (unverifiedCitationCount) notices.push(`${unverifiedCitationCount} 个引用来自未核验材料，不能作为唯一事实依据。`);
  if (invalidCitations.length) notices.push(`${invalidCitations.length} 个引用标记未匹配到来源清单。`);
  if (narrativeSections) notices.push(`${narrativeSections} 个章节属于叙述性内容；如包含具体事实或数据，请补充依据。`);
  if (!notices.length) notices.push("提纲结构、引用标记和待补数据检查均已通过，可进入合规审查。");
  return {
    sectionCount: sections.length,
    matchedSections: sections.filter((section) => section.status !== "missing").length,
    citedSections: sections.filter((section) => section.citations.length > 0 || section.usesUserData).length,
    citationCount: allCitations.length,
    verifiedCitationCount: allCitations.filter((marker) => sourceByMarker.get(marker)?.verified).length,
    unverifiedCitationCount,
    missingDataCount,
    invalidCitations,
    sections,
    notices,
  };
}
