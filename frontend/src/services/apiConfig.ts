//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined;

if (!configuredApiBaseUrl) {
  throw new Error("VITE_API_BASE_URL is missing.");
}

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, "");

console.log(`[apiConfig] VITE_API_BASE_URL=${API_BASE_URL}`);

export const API_ENDPOINTS = {
  reviewQueue: `${API_BASE_URL}/Reviews/queue`,
  reviewDetail: (aiResponseId: number | string) =>
    `${API_BASE_URL}/Reviews/${aiResponseId}`,
  reviewHistory: (caseId: number | string) =>
    `${API_BASE_URL}/Reviews/cases/${caseId}/history`,
  reviewVersion: (caseId: number | string, reviewVersion: number | string) =>
    `${API_BASE_URL}/Reviews/cases/${caseId}/versions/${reviewVersion}`,
  caseDocumentContent: (documentId: number | string) =>
    `${API_BASE_URL}/Cases/documents/${documentId}/content`,
  caseDocumentsSubmittedBy: `${API_BASE_URL}/Cases/documents/submitted-by`,
  createCase: `${API_BASE_URL}/run-review`,
  rerunCaseReview: (caseId: number | string) =>
    `${API_BASE_URL}/Cases/${caseId}/rerun-review`,
  loginUser: `${API_BASE_URL}/Auth/login`,
  currentUser: `${API_BASE_URL}/Auth/me`,
  logoutUser: `${API_BASE_URL}/Auth/logout`,
  registerUser: `${API_BASE_URL}/Auth/users`,
  forgotPassword: `${API_BASE_URL}/Auth/forgot-password`,
  verifyResetPasswordEmail: `${API_BASE_URL}/Auth/reset-password/verify-email`,
  resetPassword: `${API_BASE_URL}/Auth/reset-password`,
  promptConfigurationCurrent: `${API_BASE_URL}/prompt-configurations/current`,
  promptConfigurationVersion: (promptConfigurationId: number | string) =>
    `${API_BASE_URL}/prompt-configurations/versions/${promptConfigurationId}`,
  promptConfigurationSetCurrent: (promptConfigurationId: number | string) =>
    `${API_BASE_URL}/prompt-configurations/versions/${promptConfigurationId}/set-current`,
  promptConfigurationGenerateSuggestedPrompt: `${API_BASE_URL}/prompt-configurations/generate-suggested-prompt`,
  aiSuggestedPromptResponse: (promptSuggestionResponseId: number | string) =>
    `${API_BASE_URL}/ai-suggested-prompt-response/${promptSuggestionResponseId}`,
  aiJob: (jobId: number | string) => `${API_BASE_URL}/ai-jobs/${jobId}`,
  cancelAiJob: (jobId: number | string) =>
    `${API_BASE_URL}/ai-jobs/${jobId}/cancel`,
  promptConfigurationSave: `${API_BASE_URL}/prompt-configurations/save`,
};
