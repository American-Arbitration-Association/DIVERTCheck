//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { createContext } from "react";

import type { PromptType } from "@/services";

export type TrackedJobKind = "case-review" | "prompt";

export interface TrackedJob {
  jobId: number;
  kind: TrackedJobKind;
  status: string;
  caseId?: number;
  configurationId?: number;
  promptType?: PromptType;
  aiResponseId?: number | null;
  promptSuggestionResponseId?: number | null;
  errorMessage?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  referenceDocumentName?: string;
  referenceDocumentSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterCaseJobInput {
  jobId: number;
  caseId: number;
  status: string;
  aiResponseId?: number | null;
  scheduledAt?: string | null;
}

export interface RegisterPromptJobInput {
  jobId: number;
  configurationId?: number;
  promptType: PromptType;
  status: string;
  scheduledAt?: string | null;
  referenceDocumentName?: string;
  referenceDocumentSize?: number;
  referenceFile?: File;
}

export interface JobRegistryContextValue {
  jobs: TrackedJob[];
  registerCaseJob: (job: RegisterCaseJobInput) => void;
  registerPromptJob: (job: RegisterPromptJobInput) => void;
  updateJob: (jobId: number, changes: Partial<TrackedJob>) => void;
  removeJob: (jobId: number) => void;
  getCaseJob: (caseId: number) => TrackedJob | null;
  getPromptJob: (
    configurationId: number | undefined,
    promptType: PromptType,
  ) => TrackedJob | null;
  getPromptFile: (configurationId: number | undefined) => File | undefined;
}

export const JobRegistryContext = createContext<JobRegistryContextValue | null>(
  null,
);
