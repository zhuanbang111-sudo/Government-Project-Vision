import type { OrdinaryDocumentType } from "../app/document-templates";

export type DocumentType = OrdinaryDocumentType;

export interface WritingTask {
  title: string;
  documentType: DocumentType;
  documentSubtype: string;
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
