export const documentTypeOptions = [
  { value: "work_report", label: "工作报告" },
  { value: "situation_report", label: "情况汇报" },
  { value: "implementation_plan", label: "实施方案" },
  { value: "research_report", label: "调研报告" },
  { value: "speech", label: "领导讲话稿" },
  { value: "policy", label: "政策文件" },
  { value: "other", label: "其他材料" },
] as const;

export const usageTagOptions = [
  { value: "structure", label: "结构参考" },
  { value: "wording", label: "措辞参考" },
  { value: "facts", label: "事实数据" },
  { value: "policy", label: "政策依据" },
  { value: "case", label: "实践案例" },
  { value: "format", label: "格式模板" },
] as const;

export type KnowledgeDocumentType = typeof documentTypeOptions[number]["value"];
export type KnowledgeUsageTag = typeof usageTagOptions[number]["value"];
export type ProcessingStatus = "ready" | "failed" | "disabled";
export type VectorStatus = "pending" | "ready" | "failed";
export type VerificationStatus = "unverified" | "verified";

const documentTypeValues = new Set<string>(documentTypeOptions.map((item) => item.value));
const usageTagValues = new Set<string>(usageTagOptions.map((item) => item.value));

export function normalizeDocumentType(value: unknown): KnowledgeDocumentType {
  return typeof value === "string" && documentTypeValues.has(value) ? value as KnowledgeDocumentType : "other";
}

export function normalizeUsageTags(value: unknown): KnowledgeUsageTag[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? safeParseList(value) : [];
  return [...new Set(source.filter((item): item is KnowledgeUsageTag => typeof item === "string" && usageTagValues.has(item)))];
}

export function normalizeTopicTags(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[，,、;；\n]/) : [];
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, 12);
}

export function safeParseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function documentTypeLabel(value: string) {
  return documentTypeOptions.find((item) => item.value === value)?.label ?? "其他材料";
}

export function usageTagLabel(value: string) {
  return usageTagOptions.find((item) => item.value === value)?.label ?? value;
}

export function writingTypeToKnowledgeType(value: string): KnowledgeDocumentType | null {
  const match = documentTypeOptions.find((item) => item.label === value);
  if (match) return match.value;
  if (value === "工作总结") return "work_report";
  if (value === "行动计划") return "implementation_plan";
  return null;
}

export function inferKnowledgeMetadata(filename: string, content: string) {
  const text = `${filename}\n${content.slice(0, 8_000)}`;
  let documentType: KnowledgeDocumentType = "other";
  if (/讲话|致辞|发言/.test(text)) documentType = "speech";
  else if (/调研|调查研究/.test(text)) documentType = "research_report";
  else if (/实施方案|工作方案|行动方案|行动计划/.test(text)) documentType = "implementation_plan";
  else if (/情况汇报|汇报材料/.test(text)) documentType = "situation_report";
  else if (/条例|办法|规定|意见|通知|政策|规划/.test(text)) documentType = "policy";
  else if (/工作报告|工作总结|年度报告/.test(text)) documentType = "work_report";

  const usageTags: KnowledgeUsageTag[] = ["structure", "wording"];
  if (/\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:万|亿|项|个|户|人|公里)|统计|数据|指标/.test(text)) usageTags.push("facts");
  if (/条例|办法|规定|意见|通知|政策|法律|法规|规划/.test(text)) usageTags.push("policy");
  if (/案例|经验|做法|成效|试点/.test(text)) usageTags.push("case");
  if (/模板|格式|范本/.test(text)) usageTags.push("format");
  return { documentType, usageTags: [...new Set(usageTags)] };
}
