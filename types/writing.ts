export type DocumentType = "工作总结" | "工作报告" | "实施方案" | "行动计划" | "调研报告" | "情况汇报";

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
  knowledgeRequirement: Array<"document" | "fact" | "policy" | "department_rule" | "template">;
}

export interface WritingContext {
  task: WritingTask;
  analysis: WritingAnalysis | null;
  selectedDocumentIds: number[];
  outline: string[];
  draft: string;
}
