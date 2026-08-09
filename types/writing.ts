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

export interface WritingPlan {
  task: WritingTask;
  analysis: WritingAnalysis;
  assumptions: string[];
  fallback?: boolean;
}

export type DraftSectionStatus = "supported" | "pending" | "narrative" | "missing";

export interface DraftSectionAudit {
  title: string;
  status: DraftSectionStatus;
  citations: string[];
  verifiedCitations: string[];
  unverifiedCitations: string[];
  usesUserData: boolean;
  missingDataCount: number;
}

export interface DraftAudit {
  sectionCount: number;
  matchedSections: number;
  citedSections: number;
  citationCount: number;
  verifiedCitationCount: number;
  unverifiedCitationCount: number;
  missingDataCount: number;
  invalidCitations: string[];
  sections: DraftSectionAudit[];
  notices: string[];
}

export interface WritingContext {
  task: WritingTask;
  analysis: WritingAnalysis | null;
  selectedDocumentIds: number[];
  outline: string[];
  draft: string;
}
