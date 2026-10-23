//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./index";

export interface ReviewedDocumentApiItem {
  aiResponseDocumentId: number;
  documentId: number;
  fileSize: number | null;
  documentName: string;
  submittedBy: string | null;
  isTransactionEvidenceDocument?: boolean;
}

export interface CaseReviewDetailApiItem {
  aiResponseId: number;
  caseId: number;
  caseName: string;
  caseNumber: string;
  filingDate: string | null;
  createdDttm: string;
  scheduledAt: string | null;
  reviewDate: string | null;
  reviewVersion?: number;
  aiStatus: string;
  fullAiReview: string | null;
  summaryAiReview?: string | null;
  documents: ReviewedDocumentApiItem[];
}

export interface ReviewHistoryApiItem {
  aiResponseId: number;
  caseId: number;
  reviewVersion: number;
  reviewDate: string;
  aiStatus: string;
  promptConfigurationId: number;
  promptVersion: number;
  aiModelName: string;
  reasoningEffort: string | null;
  isCurrent: boolean;
}

export interface ReviewedDocumentItem {
  aiResponseDocumentId: number;
  documentId: number;
  fileSize: number | null;
  documentName: string;
  submittedBy: string | null;
  isTransactionEvidenceDocument: boolean;
}

export interface CaseReviewDetailItem {
  aiResponseId: number;
  caseId: number;
  caseName: string;
  caseNumber: string;
  filingDate: string;
  createdDttm?: string;
  scheduledAt: string;
  reviewDate: string;
  reviewVersion: number | null;
  status: "Analyzing" | "Complete" | "Error";
  fullAiReview: string;
  summaryAiReview: string;
  documents: ReviewedDocumentItem[];
}

export interface ReviewHistoryItem {
  id: string;
  aiResponseId: number;
  caseId: number;
  reviewVersion: number;
  reviewDate: string;
  aiStatus: string;
  promptConfigurationId: number;
  promptVersion: number;
  aiModelName: string;
  reasoningEffort: string | null;
  isCurrent: boolean;
  displayLabel: string;
  modifiedAtUtc: string;
}

export interface CaseReviewVersionApiItem {
  aiResponseId: number;
  caseId: number;
  reviewVersion: number;
  caseName: string;
  caseNumber: string;
  filingDate: string | null;
  createdDttm: string;
  scheduledAt: string | null;
  reviewDate: string | null;
  aiStatus: string;
  promptConfigurationId: number;
  promptVersion: number;
  aiModelName: string;
  reasoningEffort: string | null;
  summaryAiReview: string | null;
  fullAiReview: string | null;
  documents: ReviewedDocumentApiItem[];
}

function mapAiStatusToReviewStatus(
  aiStatus: string,
): "Analyzing" | "Complete" | "Error" {
  const normalizedStatus = aiStatus.trim().toUpperCase();

  if (normalizedStatus === "COMPLETED" || normalizedStatus === "COMPLETE") {
    return "Complete";
  }

  if (
    normalizedStatus === "IN_PROGRESS" ||
    normalizedStatus === "PROCESSING" ||
    normalizedStatus === "QUEUED" ||
    normalizedStatus === "ANALYZING"
  ) {
    return "Analyzing";
  }

  return "Error";
}

function normalizeDate(dateValue?: string | null) {
  if (!dateValue) {
    return "";
  }

  return dateValue.split("T")[0];
}

function normalizeUtcDateTime(dateValue?: string | null) {
  const normalizedValue = dateValue?.trim() ?? "";

  if (!normalizedValue || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `${normalizedValue}Z`;
}

function mapReviewedDocument(
  apiItem: ReviewedDocumentApiItem,
): ReviewedDocumentItem {
  return {
    aiResponseDocumentId: apiItem.aiResponseDocumentId,
    documentId: apiItem.documentId,
    fileSize: apiItem.fileSize,
    documentName: apiItem.documentName,
    submittedBy: apiItem.submittedBy,
    isTransactionEvidenceDocument:
      apiItem.isTransactionEvidenceDocument ?? false,
  };
}

function mapReviewHistory(apiItem: ReviewHistoryApiItem): ReviewHistoryItem {
  return {
    id: String(apiItem.aiResponseId),
    aiResponseId: apiItem.aiResponseId,
    caseId: apiItem.caseId,
    reviewVersion: apiItem.reviewVersion,
    reviewDate: apiItem.reviewDate,
    aiStatus: apiItem.aiStatus,
    promptConfigurationId: apiItem.promptConfigurationId,
    promptVersion: apiItem.promptVersion,
    aiModelName: apiItem.aiModelName,
    reasoningEffort: apiItem.reasoningEffort,
    isCurrent: apiItem.isCurrent,
    displayLabel: `v${apiItem.reviewVersion}`,
    modifiedAtUtc: apiItem.reviewDate,
  };
}

function mapCaseReviewDetail(
  apiItem: CaseReviewDetailApiItem,
): CaseReviewDetailItem {
  return {
    aiResponseId: apiItem.aiResponseId,
    caseId: apiItem.caseId,
    caseName: apiItem.caseName,
    caseNumber: apiItem.caseNumber,
    filingDate: normalizeDate(apiItem.filingDate),
    createdDttm: normalizeUtcDateTime(apiItem.createdDttm),
    scheduledAt: normalizeUtcDateTime(apiItem.scheduledAt),
    reviewDate: normalizeUtcDateTime(apiItem.reviewDate),
    reviewVersion: apiItem.reviewVersion ?? null,
    status: mapAiStatusToReviewStatus(apiItem.aiStatus),
    fullAiReview: apiItem.fullAiReview?.trim() ?? "",
    summaryAiReview: apiItem.summaryAiReview?.trim() ?? "",
    documents: apiItem.documents.map(mapReviewedDocument),
  };
}

function mapCaseReviewVersion(
  apiItem: CaseReviewVersionApiItem,
): CaseReviewDetailItem {
  return {
    aiResponseId: apiItem.aiResponseId,
    caseId: apiItem.caseId,
    caseName: apiItem.caseName,
    caseNumber: apiItem.caseNumber,
    filingDate: normalizeDate(apiItem.filingDate),
    createdDttm: normalizeUtcDateTime(apiItem.createdDttm),
    scheduledAt: normalizeUtcDateTime(apiItem.scheduledAt),
    reviewDate: normalizeUtcDateTime(apiItem.reviewDate),
    reviewVersion: apiItem.reviewVersion ?? null,
    status: mapAiStatusToReviewStatus(apiItem.aiStatus),
    fullAiReview: apiItem.fullAiReview?.trim() ?? "",
    summaryAiReview: apiItem.summaryAiReview?.trim() ?? "",
    documents: apiItem.documents.map(mapReviewedDocument),
  };
}

export async function getReviewDetail(aiResponseId: number) {
  const response = await apiClient.get<CaseReviewDetailApiItem>(
    API_ENDPOINTS.reviewDetail(aiResponseId),
  );

  return mapCaseReviewDetail(response.data);
}

export async function getCaseDocumentContent(documentId: number) {
  const response = await apiClient.get<Blob>(
    API_ENDPOINTS.caseDocumentContent(documentId),
    {
      responseType: "blob",
      headers: {
        accept: "*/*",
      },
    },
  );

  return response.data;
}

export async function getReviewHistory(caseId: number) {
  const response = await apiClient.get<ReviewHistoryApiItem[]>(
    API_ENDPOINTS.reviewHistory(caseId),
  );

  return response.data.map(mapReviewHistory);
}

export async function getReviewVersion(caseId: number, reviewVersion: number) {
  const response = await apiClient.get<CaseReviewVersionApiItem>(
    API_ENDPOINTS.reviewVersion(caseId, reviewVersion),
  );

  return mapCaseReviewVersion(response.data);
}
