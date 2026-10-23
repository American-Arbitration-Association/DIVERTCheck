//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./index";

export interface PromptConfigurationOptionApiItem {
  value: string;
  label: string;
  isDefault: boolean;
}

export interface PromptConfigurationVersionHistoryApiItem {
  promptConfigurationId: number;
  promptId: number;
  promptVersion: number;
  displayLabel: string;
  createdAtUtc: string;
  modifiedAtUtc: string;
  isCurrent: boolean;
}

export interface CurrentPromptConfigurationApiItem {
  promptConfigurationId: number;
  promptId: number;
  promptVersion: number;
  aiModelName: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  eligibilityPrompt: string;
  summaryPrompt: string;
  availableModels: PromptConfigurationOptionApiItem[];
  availableReasoningEfforts: PromptConfigurationOptionApiItem[];
  versionHistory: PromptConfigurationVersionHistoryApiItem[];
}

export interface PromptConfigurationOptionItem {
  value: string;
  label: string;
  isDefault: boolean;
}

export interface PromptConfigurationVersionHistoryItem {
  id: string;
  promptConfigurationId: number;
  promptId: number;
  promptVersion: number;
  displayLabel: string;
  createdAtUtc: string;
  modifiedAtUtc: string;
  isCurrent: boolean;
}

export interface CurrentPromptConfigurationItem {
  promptConfigurationId: number;
  promptId: number;
  promptVersion: number;
  aiModelName: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  eligibilityPrompt: string;
  summaryPrompt: string;
  availableModels: PromptConfigurationOptionItem[];
  availableReasoningEfforts: PromptConfigurationOptionItem[];
  versionHistory: PromptConfigurationVersionHistoryItem[];
}

interface SuggestedPromptJobResultApiItem {
  documentName: string;
  fileSize: number;
  promptTarget: string;
  processingStartedAtUtc: string;
  processedAtUtc: string;
  generatedPromptReview: string;
}

interface SuggestedPromptResponseApiItem {
  promptSuggestionResponseId: number;
  promptConfigurationId: number;
  promptType: string;
  aiStatus: string;
  generatedPrompt: string;
  rawResponse: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface AiJobApiItem<TResult> {
  jobId: number;
  jobType: string;
  jobStatus: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  aiResponseId: number | null;
  promptSuggestionResponseId: number | null;
  result: TResult | null;
}

export interface GenerateSuggestedPromptItem {
  documentName: string;
  fileSize: number;
  processingStatus: string;
  processingStartedAtUtc: string;
  processedAtUtc: string;
  generatedPromptReview: string;
  jobId: number;
}

export type PromptType = "main" | "summary";

export interface SavePromptConfigurationRequest {
  aiModelName: string;
  reasoningEffort: string;
  eligibilityPrompt: string;
  summaryPrompt: string;
  maxOutputTokens: number;
}

export interface SavePromptConfigurationApiItem {
  message: string;
  previousPromptConfigurationId: number;
  configuration: CurrentPromptConfigurationApiItem;
}

export interface SavePromptConfigurationItem {
  message: string;
  previousPromptConfigurationId: number;
  configuration: CurrentPromptConfigurationItem;
}

export interface SetCurrentPromptConfigurationApiItem {
  message: string;
  promptConfigurationId: number;
}

export interface SetCurrentPromptConfigurationItem {
  message: string;
  promptConfigurationId: number;
}

function mapPromptConfigurationOption(
  apiItem: PromptConfigurationOptionApiItem,
): PromptConfigurationOptionItem {
  return {
    value: apiItem.value,
    label: apiItem.label,
    isDefault: apiItem.isDefault,
  };
}

function mapPromptConfigurationVersionHistory(
  apiItem: PromptConfigurationVersionHistoryApiItem,
): PromptConfigurationVersionHistoryItem {
  return {
    id: String(apiItem.promptConfigurationId),
    promptConfigurationId: apiItem.promptConfigurationId,
    promptId: apiItem.promptId,
    promptVersion: apiItem.promptVersion,
    displayLabel: apiItem.displayLabel,
    createdAtUtc: apiItem.createdAtUtc,
    modifiedAtUtc: apiItem.modifiedAtUtc,
    isCurrent: apiItem.isCurrent,
  };
}

function mapCurrentPromptConfiguration(
  apiItem: CurrentPromptConfigurationApiItem,
): CurrentPromptConfigurationItem {
  return {
    promptConfigurationId: apiItem.promptConfigurationId,
    promptId: apiItem.promptId,
    promptVersion: apiItem.promptVersion,
    aiModelName: apiItem.aiModelName,
    reasoningEffort: apiItem.reasoningEffort,
    maxOutputTokens: apiItem.maxOutputTokens,
    eligibilityPrompt: apiItem.eligibilityPrompt,
    summaryPrompt: apiItem.summaryPrompt,
    availableModels: apiItem.availableModels.map(mapPromptConfigurationOption),
    availableReasoningEfforts: apiItem.availableReasoningEfforts.map(
      mapPromptConfigurationOption,
    ),
    versionHistory: apiItem.versionHistory.map(
      mapPromptConfigurationVersionHistory,
    ),
  };
}

const SUGGESTED_PROMPT_POLL_INTERVAL_MS = 10_000;
const SUGGESTED_PROMPT_POLL_TIMEOUT_MS = 10 * 60 * 1_000;
const ACTIVE_AI_JOB_STATUSES = new Set([
  "QUEUED",
  "PENDING",
  "SCHEDULED",
  "IN_PROGRESS",
  "PROCESSING",
  "RUNNING",
  "RETRY",
  "RETRYING",
]);
const FAILED_AI_JOB_STATUSES = new Set(["FAILED", "CANCELED", "CANCELLED"]);

function mapGeneratedSuggestedPrompt(
  apiItem: AiJobApiItem<SuggestedPromptJobResultApiItem>,
): GenerateSuggestedPromptItem {
  if (!apiItem.result) {
    throw new Error("The suggested prompt job completed without a result.");
  }

  return {
    documentName: apiItem.result.documentName,
    fileSize: apiItem.result.fileSize,
    processingStatus: apiItem.jobStatus,
    processingStartedAtUtc: apiItem.result.processingStartedAtUtc,
    processedAtUtc: apiItem.result.processedAtUtc,
    generatedPromptReview: apiItem.result.generatedPromptReview,
    jobId: apiItem.jobId,
  };
}

function mapGeneratedSuggestedPromptResponse(
  job: AiJobApiItem<SuggestedPromptJobResultApiItem>,
  promptResponse: SuggestedPromptResponseApiItem,
): GenerateSuggestedPromptItem {
  const generatedPromptReview = promptResponse.generatedPrompt?.trim() ?? "";

  if (!generatedPromptReview) {
    throw new Error("The suggested prompt response completed without content.");
  }

  return {
    documentName: job.result?.documentName ?? "",
    fileSize: job.result?.fileSize ?? 0,
    processingStatus: promptResponse.aiStatus || job.jobStatus,
    processingStartedAtUtc:
      job.startedAt ?? job.result?.processingStartedAtUtc ?? job.scheduledAt,
    processedAtUtc:
      job.completedAt ??
      job.result?.processedAtUtc ??
      promptResponse.modifiedAt ??
      promptResponse.createdAt,
    generatedPromptReview,
    jobId: job.jobId,
  };
}

async function getSuggestedPromptResponse(
  promptSuggestionResponseId: number,
  options?: { skipRequestTracking?: boolean; signal?: AbortSignal },
) {
  const response = await apiClient.get<SuggestedPromptResponseApiItem>(
    API_ENDPOINTS.aiSuggestedPromptResponse(promptSuggestionResponseId),
    {
      skipRequestTracking: options?.skipRequestTracking,
      signal: options?.signal,
    },
  );

  return response.data;
}

function waitForSuggestedPromptPoll(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The request was canceled.", "AbortError"));
      return;
    }

    const handleAbort = () => {
      globalThis.clearTimeout(timeoutId);
      reject(new DOMException("The request was canceled.", "AbortError"));
    };
    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function waitForSuggestedPromptJob(
  initialJob: AiJobApiItem<SuggestedPromptJobResultApiItem>,
  options?: { skipRequestTracking?: boolean; signal?: AbortSignal },
) {
  if (!Number.isSafeInteger(initialJob.jobId) || initialJob.jobId < 1) {
    throw new Error("The suggested prompt request returned an invalid job ID.");
  }

  const pollingStartedAt = Date.now();
  let job = initialJob;

  while (true) {
    const normalizedStatus = job.jobStatus.trim().toUpperCase();

    if (normalizedStatus === "COMPLETED") {
      if (job.promptSuggestionResponseId) {
        const promptResponse = await getSuggestedPromptResponse(
          job.promptSuggestionResponseId,
          options,
        );
        return mapGeneratedSuggestedPromptResponse(job, promptResponse);
      }

      return mapGeneratedSuggestedPrompt(job);
    }

    if (FAILED_AI_JOB_STATUSES.has(normalizedStatus)) {
      const jobErrorMessage = [
        job.errorMessage,
        `Suggested prompt generation ${normalizedStatus.toLowerCase()}.`,
      ]
        .map((message) => message?.trim())
        .find((message) => Boolean(message));
      throw new Error(jobErrorMessage);
    }

    if (!ACTIVE_AI_JOB_STATUSES.has(normalizedStatus)) {
      throw new Error(`Unexpected AI job status: ${job.jobStatus}.`);
    }

    if (Date.now() - pollingStartedAt >= SUGGESTED_PROMPT_POLL_TIMEOUT_MS) {
      throw new Error("Suggested prompt generation timed out.");
    }

    await waitForSuggestedPromptPoll(
      SUGGESTED_PROMPT_POLL_INTERVAL_MS,
      options?.signal,
    );

    const response = await apiClient.get<
      AiJobApiItem<SuggestedPromptJobResultApiItem>
    >(API_ENDPOINTS.aiJob(initialJob.jobId), {
      skipRequestTracking: options?.skipRequestTracking,
      signal: options?.signal,
    });

    job = response.data;
  }
}

function mapSavedPromptConfiguration(
  apiItem: SavePromptConfigurationApiItem,
): SavePromptConfigurationItem {
  return {
    message: apiItem.message,
    previousPromptConfigurationId: apiItem.previousPromptConfigurationId,
    configuration: mapCurrentPromptConfiguration(apiItem.configuration),
  };
}

function mapSetCurrentPromptConfiguration(
  apiItem: SetCurrentPromptConfigurationApiItem,
): SetCurrentPromptConfigurationItem {
  return {
    message: apiItem.message,
    promptConfigurationId: apiItem.promptConfigurationId,
  };
}

export async function getCurrentPromptConfiguration() {
  const response = await apiClient.get<CurrentPromptConfigurationApiItem>(
    API_ENDPOINTS.promptConfigurationCurrent,
  );

  return mapCurrentPromptConfiguration(response.data);
}

export async function getPromptConfigurationVersion(
  promptConfigurationId: number,
) {
  const response = await apiClient.get<CurrentPromptConfigurationApiItem>(
    API_ENDPOINTS.promptConfigurationVersion(promptConfigurationId),
  );

  return mapCurrentPromptConfiguration(response.data);
}

export async function generateSuggestedPrompt(
  file?: File | null,
  promptType: PromptType = "main",
  options?: {
    skipRequestTracking?: boolean;
    signal?: AbortSignal;
    onJobQueued?: (jobId: number) => void;
  },
) {
  const formData = new FormData();

  if (file) {
    formData.append("File", file);
  }
  formData.append("PromptType", promptType);

  const response = await apiClient.post<
    AiJobApiItem<SuggestedPromptJobResultApiItem>
  >(API_ENDPOINTS.promptConfigurationGenerateSuggestedPrompt, formData, {
    headers: {
      accept: "text/plain",
      "Content-Type": "multipart/form-data",
    },
    skipRequestTracking: options?.skipRequestTracking,
    signal: options?.signal,
  });

  options?.onJobQueued?.(response.data.jobId);
  return waitForSuggestedPromptJob(response.data, options);
}

export async function queueSuggestedPromptJob(
  file?: File | null,
  promptType: PromptType = "main",
  options?: { skipRequestTracking?: boolean; signal?: AbortSignal },
) {
  const formData = new FormData();

  if (file) {
    formData.append("File", file);
  }
  formData.append("PromptType", promptType);

  const response = await apiClient.post<
    AiJobApiItem<SuggestedPromptJobResultApiItem>
  >(API_ENDPOINTS.promptConfigurationGenerateSuggestedPrompt, formData, {
    headers: {
      accept: "text/plain",
      "Content-Type": "multipart/form-data",
    },
    skipRequestTracking: options?.skipRequestTracking,
    signal: options?.signal,
  });

  return response.data;
}

export async function getCompletedSuggestedPrompt(
  jobId: number,
  options?: { skipRequestTracking?: boolean; signal?: AbortSignal },
) {
  const response = await apiClient.get<
    AiJobApiItem<SuggestedPromptJobResultApiItem>
  >(API_ENDPOINTS.aiJob(jobId), {
    skipRequestTracking: options?.skipRequestTracking,
    signal: options?.signal,
  });
  const job = response.data;

  if (job.jobStatus.trim().toUpperCase() !== "COMPLETED") {
    throw new Error(`Suggested prompt job is ${job.jobStatus.toLowerCase()}.`);
  }

  if (job.promptSuggestionResponseId) {
    const promptResponse = await getSuggestedPromptResponse(
      job.promptSuggestionResponseId,
      options,
    );
    return mapGeneratedSuggestedPromptResponse(job, promptResponse);
  }

  return mapGeneratedSuggestedPrompt(job);
}

export async function cancelGeneratedSuggestedPrompt(
  jobId: number,
  options?: { skipRequestTracking?: boolean },
) {
  const response = await apiClient.post<PromptGenerationCancelResponseApiItem>(
    API_ENDPOINTS.cancelAiJob(jobId),
    {},
    {
      headers: {
        accept: "text/plain",
      },
      skipRequestTracking: options?.skipRequestTracking,
    },
  );

  return mapPromptGenerationCancelResponse(response.data);
}

export interface PromptGenerationCancelResponseApiItem {
  message: string;
  cancellationRequested: boolean;
}

export interface PromptGenerationCancelResponseItem {
  message: string;
  cancellationRequested: boolean;
}

function mapPromptGenerationCancelResponse(
  apiItem: PromptGenerationCancelResponseApiItem,
): PromptGenerationCancelResponseItem {
  return {
    message: apiItem.message,
    cancellationRequested: apiItem.cancellationRequested,
  };
}

export async function savePromptConfiguration(
  payload: SavePromptConfigurationRequest,
) {
  const response = await apiClient.post<SavePromptConfigurationApiItem>(
    API_ENDPOINTS.promptConfigurationSave,
    payload,
  );

  return mapSavedPromptConfiguration(response.data);
}

export async function setCurrentPromptConfigurationVersion(
  promptConfigurationId: number,
) {
  const response = await apiClient.put<SetCurrentPromptConfigurationApiItem>(
    API_ENDPOINTS.promptConfigurationSetCurrent(promptConfigurationId),
    {},
  );

  return mapSetCurrentPromptConfiguration(response.data);
}
