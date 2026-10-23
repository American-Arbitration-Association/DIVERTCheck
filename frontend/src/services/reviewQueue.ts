//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./index";

export interface ReviewQueueApiItem {
  aiResponseId: number;
  caseId: number;
  caseName: string | null;
  caseNumber: string | null;
  filingDate: string | null;
  reviewDate: string | null;
  aiStatus: string | null;
  summary: string | null;
  documentName?: string | null;
  documents?: ReviewQueueDocumentApiItem[] | null;
}

export interface ReviewQueueDocumentApiItem {
  aiResponseDocumentId?: number;
  documentId?: number;
  documentName: string | null;
}

export interface ReviewQueueDocumentItem {
  aiResponseDocumentId?: number;
  documentId?: number;
  documentName: string;
  documentHref: string;
}

export interface ReviewQueueItem {
  id: string;
  aiResponseId: number;
  caseId: number;
  caseName: string;
  caseNumber: string;
  filingDate: string;
  reviewDate: string;
  status: "Analyzing" | "Complete" | "Error";
  summary: string;
  documentName: string;
  documentHref: string;
  documents: ReviewQueueDocumentItem[];
}

function mapAiStatusToReviewStatus(
  aiStatus: string | null | undefined,
): "Analyzing" | "Complete" | "Error" {
  const normalizedStatus = aiStatus?.trim().toUpperCase() ?? "";

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

function normalizeText(value: string | null | undefined) {
  return value ?? "null";
}

function normalizeDate(dateValue: string | null | undefined) {
  return dateValue?.split("T")[0] ?? "null";
}

function mapReviewQueueDocument(
  apiItem: ReviewQueueDocumentApiItem,
): ReviewQueueDocumentItem {
  return {
    aiResponseDocumentId: apiItem.aiResponseDocumentId,
    documentId: apiItem.documentId,
    documentName: normalizeText(apiItem.documentName),
    documentHref: "#",
  };
}

function mapReviewQueueItem(apiItem: ReviewQueueApiItem): ReviewQueueItem {
  const normalizedDocuments = apiItem.documents?.length
    ? apiItem.documents.map(mapReviewQueueDocument)
    : apiItem.documentName
      ? [
          {
            documentName: apiItem.documentName,
            documentHref: "#",
          },
        ]
      : [];
  const documents = normalizedDocuments;
  const primaryDocument = documents[0];

  return {
    id: String(apiItem.aiResponseId),
    aiResponseId: apiItem.aiResponseId,
    caseId: apiItem.caseId,
    caseName: normalizeText(apiItem.caseName),
    caseNumber: normalizeText(apiItem.caseNumber),
    filingDate: normalizeDate(apiItem.filingDate),
    reviewDate: normalizeDate(apiItem.reviewDate),
    status: mapAiStatusToReviewStatus(apiItem.aiStatus),
    summary: normalizeText(apiItem.summary),
    documentName: primaryDocument?.documentName ?? "",
    documentHref: primaryDocument?.documentHref ?? "#",
    documents,
  };
}

export async function getReviewQueue() {
  const response = await apiClient.get<ReviewQueueApiItem[]>(
    API_ENDPOINTS.reviewQueue,
  );
  return response.data.map(mapReviewQueueItem);
}
