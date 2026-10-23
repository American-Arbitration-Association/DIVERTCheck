//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { isAxiosError } from "axios";
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./index";

export type CaseSubmittedBy = "P" | "D";

export interface CreateCaseUploadRequest {
  caseNumber: string;
  caseName: string;
  filingDate: string;
  documents: {
    document: File;
    submittedBy: CaseSubmittedBy;
    isTransactionEvidence: boolean;
  }[];
}

export interface CreateCaseUploadResponse {
  message?: string;
  title?: string;
  detail?: string;
  error?: string;
}

export async function createCaseUpload(payload: CreateCaseUploadRequest) {
  const requestPayload = new FormData();
  requestPayload.append("CaseNumber", payload.caseNumber);
  requestPayload.append("CaseName", payload.caseName);
  requestPayload.append("FilingDate", payload.filingDate);

  payload.documents.forEach((document, index) => {
    const documentField = `Documents[${index}]`;
    requestPayload.append(`${documentField}.Document`, document.document);
    requestPayload.append(`${documentField}.SubmittedBy`, document.submittedBy);
    requestPayload.append(
      `${documentField}.TransactionEvidence`,
      String(document.isTransactionEvidence),
    );
  });

  const response = await apiClient.post<CreateCaseUploadResponse | string>(
    API_ENDPOINTS.createCase,
    requestPayload,
    {
      headers: {
        accept: "text/plain",
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

export interface RerunCaseReviewDocumentRequest {
  documentId?: number;
  document?: File;
  submittedBy: CaseSubmittedBy;
  isTransactionEvidence: boolean;
}

export interface RerunCaseReviewRequest {
  promptConfigurationId: number;
  documents: RerunCaseReviewDocumentRequest[];
}

export interface RerunReviewDocumentItem {
  documentId: number;
  documentUrl: string;
  caseId: number;
  documentName: string;
  fileSize: number | null;
  uploadedAt: string;
  submittedBy: CaseSubmittedBy | null;
  isTransactionEvidenceDocument: boolean;
}

export interface RerunCaseReviewResponse {
  jobId: number;
  aiResponseId: number;
  jobStatus: string;
  caseId: number;
  documentIds: number[];
  scheduledAt: string;
  uploadedDocuments: RerunReviewDocumentItem[];
  documents: RerunReviewDocumentItem[];
}

export interface CancelRerunCaseReviewResponse {
  message: string;
  cancellationRequested: boolean;
}

export interface RerunReviewJobStatusResponse {
  jobId: number;
  jobType: string;
  jobStatus: string;
  attempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  lastFailureMessage: string | null;
  aiResponseId: number | null;
  result: {
    aiResponseId: number;
    caseId: number;
    aiResponseStatus: string;
    fullResponse: string | null;
    summaryResponse: string | null;
  } | null;
}

function getErrorMessage(error: unknown) {
  const sanitizeCancelReviewMessage = (message: string) =>
    message.replace(
      /^AI job \d+ has already completed and cannot be canceled\.?$/i,
      "This AI job has already completed and cannot be canceled.",
    );

  if (isAxiosError(error)) {
    const responseData: unknown = error.response?.data;

    if (typeof responseData === "string" && responseData.trim()) {
      return sanitizeCancelReviewMessage(responseData.trim());
    }

    if (
      responseData &&
      typeof responseData === "object" &&
      "message" in responseData &&
      typeof (responseData as { message?: unknown }).message === "string"
    ) {
      const message = (responseData as { message: string }).message.trim();

      if (message) {
        return sanitizeCancelReviewMessage(message);
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return sanitizeCancelReviewMessage(error.message.trim());
  }

  return "Unable to cancel the review.";
}

export async function rerunCaseReview(
  caseId: number,
  payload: RerunCaseReviewRequest,
) {
  const existingDocuments = payload.documents.filter(
    (document) => typeof document.documentId === "number",
  );
  const uploadedDocuments = payload.documents.filter(
    (document) =>
      typeof document.documentId !== "number" && Boolean(document.document),
  );
  // Existing documents are sent by id, plus an indexed DocumentId entry so the
  // API saves their SubmittedBy and TransactionEvidence edits. New files are
  // sent as indexed Document entries with the same fields.
  const requestPayload = new FormData();
  requestPayload.append(
    "PromptConfigurationId",
    String(payload.promptConfigurationId),
  );
  existingDocuments.forEach((document) => {
    requestPayload.append("DocumentIds", String(document.documentId));
  });
  [...existingDocuments, ...uploadedDocuments].forEach((document, index) => {
    const documentField = `Documents[${index}]`;

    if (typeof document.documentId === "number") {
      requestPayload.append(
        `${documentField}.DocumentId`,
        String(document.documentId),
      );
    } else {
      requestPayload.append(`${documentField}.Document`, document.document!);
    }

    requestPayload.append(`${documentField}.SubmittedBy`, document.submittedBy);
    requestPayload.append(
      `${documentField}.TransactionEvidence`,
      String(document.isTransactionEvidence),
    );
  });

  const response = await apiClient.post<RerunCaseReviewResponse>(
    API_ENDPOINTS.rerunCaseReview(caseId),
    requestPayload,
    {
      headers: {
        accept: "text/plain",
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

export async function cancelRerunCaseReview(jobId: number) {
  try {
    const response = await apiClient.post<CancelRerunCaseReviewResponse>(
      API_ENDPOINTS.cancelAiJob(jobId),
      {},
      {
        headers: {
          accept: "text/plain",
        },
      },
    );

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getRerunReviewJobStatus(jobId: number) {
  const response = await apiClient.get<RerunReviewJobStatusResponse>(
    API_ENDPOINTS.aiJob(jobId),
    {
      skipRequestTracking: true,
    },
  );

  return response.data;
}
