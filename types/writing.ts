export type DocumentType = "工作报告" | "情况汇报" | "实施方案" | "调研报告" | "领导讲话稿";

export interface WritingTask {
  title: string;
  documentType: DocumentType;
  department: string;
  audience: string;
  purpose: string;
  timeRange: string;
  focus: string;
}

export interface WritingAnalysis {
  documentPurpose: string;
  recommendedStructure: string[];
  keywords: string[];
  riskPoints: string[];
  knowledgeRequirement: Array<"structure" | "wording" | "facts" | "policy" | "case" | "format">;
}

export interface WritingContext {
  task: WritingTask;
  analysis: WritingAnalysis | null;
  selectedDocumentIds: number[];
  outline: string[];
  draft: string;
}
