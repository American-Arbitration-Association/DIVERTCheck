//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getRerunReviewJobStatus } from "@/services";
import {
  JobRegistryContext,
  type JobRegistryContextValue,
  type RegisterCaseJobInput,
  type RegisterPromptJobInput,
  type TrackedJob,
} from "./job-registry-context";
import { useAuth } from "./useAuth";

const STORAGE_KEY_PREFIX = "divertcheck-ai-jobs";
const POLL_INTERVAL_MS = 10_000;
const POLLING_LEASE_DURATION_MS = POLL_INTERVAL_MS * 2.5;
const ACTIVE_STATUSES = new Set([
  "QUEUED",
  "PENDING",
  "SCHEDULED",
  "IN_PROGRESS",
  "PROCESSING",
  "RUNNING",
  "RETRY",
  "RETRYING",
]);
const CANCELED_STATUSES = new Set(["CANCELED", "CANCELLED"]);

interface LegacyPersistedRegistry {
  jobs: Record<string, TrackedJob>;
}

interface PollingLease {
  ownerId: string;
  expiresAt: number;
}

function normalizeStatus(status: string | null | undefined) {
  return status?.trim().toUpperCase() ?? "";
}

function isTrackedJob(value: unknown): value is TrackedJob {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TrackedJob>;
  return (
    Number.isSafeInteger(candidate.jobId) &&
    Number(candidate.jobId) > 0 &&
    (candidate.kind === "case-review" || candidate.kind === "prompt") &&
    typeof candidate.status === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function readStoredJob(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return isTrackedJob(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readRegistry(storageNamespace: string | null) {
  if (!storageNamespace || typeof window === "undefined") {
    return {} as Record<string, TrackedJob>;
  }

  const jobStoragePrefix = `${storageNamespace}:job:`;
  const jobs: Record<string, TrackedJob> = {};

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (!key?.startsWith(jobStoragePrefix)) {
      continue;
    }

    const job = readStoredJob(window.localStorage.getItem(key));
    if (job) {
      jobs[String(job.jobId)] = job;
    }
  }

  const legacyValue = window.localStorage.getItem(storageNamespace);

  try {
    const parsed = JSON.parse(
      legacyValue ?? "null",
    ) as Partial<LegacyPersistedRegistry> | null;
    const entries = Object.entries(parsed?.jobs ?? {}).filter(([, job]) =>
      isTrackedJob(job),
    );

    entries.forEach(([jobId, job]) => {
      if (!jobs[jobId]) {
        jobs[jobId] = job;
        window.localStorage.setItem(
          `${jobStoragePrefix}${jobId}`,
          JSON.stringify(job),
        );
      }
    });
  } catch {
    // Ignore malformed legacy state and continue with valid per-job entries.
  }

  window.localStorage.removeItem(storageNamespace);
  return jobs;
}

function clearStoredJobs(storageNamespace: string) {
  const keyPrefix = `${storageNamespace}:`;

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key === storageNamespace || key?.startsWith(keyPrefix)) {
      window.localStorage.removeItem(key);
    }
  }
}

function createTabId() {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const randomValues = new Uint32Array(4);
    cryptoApi.getRandomValues(randomValues);
    return Array.from(randomValues, (value) => value.toString(36)).join("-");
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function newestJob(jobs: TrackedJob[]) {
  return (
    [...jobs].sort((left, right) => {
      const activeDifference =
        Number(ACTIVE_STATUSES.has(normalizeStatus(right.status))) -
        Number(ACTIVE_STATUSES.has(normalizeStatus(left.status)));

      return (
        activeDifference ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
        right.jobId - left.jobId
      );
    })[0] ?? null
  );
}

export function JobRegistryProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.userId;
  const storageNamespace = userId ? `${STORAGE_KEY_PREFIX}:${userId}` : null;
  const jobStoragePrefix = storageNamespace ? `${storageNamespace}:job:` : null;
  const pollingLeaseKey = storageNamespace
    ? `${storageNamespace}:polling-lease`
    : null;
  const previousStorageNamespaceRef = useRef<string | null>(null);
  const tabIdRef = useRef<string | null>(null);
  const [jobsById, setJobsById] = useState<Record<string, TrackedJob>>({});
  const jobsRef = useRef(jobsById);
  const promptFilesRef = useRef<Record<string, File>>({});

  useEffect(() => {
    jobsRef.current = jobsById;
  }, [jobsById]);

  useEffect(() => {
    tabIdRef.current ??= createTabId();
    const previousStorageNamespace = previousStorageNamespaceRef.current;

    if (previousStorageNamespace && !storageNamespace) {
      clearStoredJobs(previousStorageNamespace);
    }

    previousStorageNamespaceRef.current = storageNamespace;
    promptFilesRef.current = {};
    queueMicrotask(() => setJobsById(readRegistry(storageNamespace)));
  }, [storageNamespace]);

  useEffect(() => {
    if (!jobStoragePrefix) {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        !event.key?.startsWith(jobStoragePrefix)
      ) {
        return;
      }

      const jobId = event.key.slice(jobStoragePrefix.length);
      const incomingJob = readStoredJob(event.newValue);

      setJobsById((current) => {
        if (!incomingJob) {
          if (!current[jobId]) {
            return current;
          }

          const nextJobs = { ...current };
          delete nextJobs[jobId];
          return nextJobs;
        }

        const currentJob = current[jobId];
        if (
          currentJob &&
          CANCELED_STATUSES.has(normalizeStatus(currentJob.status)) &&
          !CANCELED_STATUSES.has(normalizeStatus(incomingJob.status))
        ) {
          return current;
        }

        if (
          currentJob &&
          Date.parse(currentJob.updatedAt) > Date.parse(incomingJob.updatedAt)
        ) {
          return current;
        }

        return { ...current, [jobId]: incomingJob };
      });
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [jobStoragePrefix]);

  const updateJob = useCallback(
    (jobId: number, changes: Partial<TrackedJob>) => {
      setJobsById((current) => {
        const existingJob = current[String(jobId)];

        if (!existingJob) {
          return current;
        }

        const storedJob = jobStoragePrefix
          ? readStoredJob(
              window.localStorage.getItem(`${jobStoragePrefix}${jobId}`),
            )
          : null;
        const nextStatus = changes.status
          ? normalizeStatus(changes.status)
          : normalizeStatus(existingJob.status);

        if (
          storedJob &&
          CANCELED_STATUSES.has(normalizeStatus(storedJob.status)) &&
          !CANCELED_STATUSES.has(nextStatus)
        ) {
          return {
            ...current,
            [jobId]: storedJob,
          };
        }

        const updatedJob = {
          ...existingJob,
          ...changes,
          jobId: existingJob.jobId,
          kind: existingJob.kind,
          updatedAt: new Date().toISOString(),
        };

        if (jobStoragePrefix) {
          window.localStorage.setItem(
            `${jobStoragePrefix}${jobId}`,
            JSON.stringify(updatedJob),
          );
        }

        return {
          ...current,
          [jobId]: updatedJob,
        };
      });
    },
    [jobStoragePrefix],
  );

  const removeJob = useCallback(
    (jobId: number) => {
      setJobsById((current) => {
        if (!current[String(jobId)]) {
          return current;
        }

        const nextJobs = { ...current };
        delete nextJobs[String(jobId)];
        if (jobStoragePrefix) {
          window.localStorage.removeItem(`${jobStoragePrefix}${jobId}`);
        }
        return nextJobs;
      });
    },
    [jobStoragePrefix],
  );

  const registerCaseJob = useCallback(
    (job: RegisterCaseJobInput) => {
      const timestamp = new Date().toISOString();
      setJobsById((current) => {
        const nextJobs = Object.fromEntries(
          Object.entries(current).filter(
            ([, trackedJob]) =>
              trackedJob.kind !== "case-review" ||
              trackedJob.caseId !== job.caseId,
          ),
        );

        Object.keys(current).forEach((existingJobId) => {
          if (!nextJobs[existingJobId] && jobStoragePrefix) {
            window.localStorage.removeItem(
              `${jobStoragePrefix}${existingJobId}`,
            );
          }
        });

        const trackedJob: TrackedJob = {
          jobId: job.jobId,
          kind: "case-review",
          caseId: job.caseId,
          status: normalizeStatus(job.status) || "QUEUED",
          aiResponseId: job.aiResponseId,
          scheduledAt: job.scheduledAt,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        if (jobStoragePrefix) {
          window.localStorage.setItem(
            `${jobStoragePrefix}${job.jobId}`,
            JSON.stringify(trackedJob),
          );
        }

        return {
          ...nextJobs,
          [job.jobId]: trackedJob,
        };
      });
    },
    [jobStoragePrefix],
  );

  const registerPromptJob = useCallback(
    (job: RegisterPromptJobInput) => {
      const timestamp = new Date().toISOString();

      if (job.referenceFile) {
        promptFilesRef.current[String(job.configurationId ?? "current")] =
          job.referenceFile;
      }

      setJobsById((current) => {
        const nextJobs = Object.fromEntries(
          Object.entries(current).filter(
            ([, trackedJob]) =>
              trackedJob.kind !== "prompt" ||
              trackedJob.configurationId !== job.configurationId ||
              trackedJob.promptType !== job.promptType,
          ),
        );

        Object.keys(current).forEach((existingJobId) => {
          if (!nextJobs[existingJobId] && jobStoragePrefix) {
            window.localStorage.removeItem(
              `${jobStoragePrefix}${existingJobId}`,
            );
          }
        });

        const trackedJob: TrackedJob = {
          jobId: job.jobId,
          kind: "prompt",
          configurationId: job.configurationId,
          promptType: job.promptType,
          status: normalizeStatus(job.status) || "QUEUED",
          scheduledAt: job.scheduledAt,
          referenceDocumentName: job.referenceDocumentName,
          referenceDocumentSize: job.referenceDocumentSize,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        if (jobStoragePrefix) {
          window.localStorage.setItem(
            `${jobStoragePrefix}${job.jobId}`,
            JSON.stringify(trackedJob),
          );
        }

        return {
          ...nextJobs,
          [job.jobId]: trackedJob,
        };
      });
    },
    [jobStoragePrefix],
  );

  const activeJobIdsKey = useMemo(
    () =>
      Object.values(jobsById)
        .filter((job) => ACTIVE_STATUSES.has(normalizeStatus(job.status)))
        .map((job) => job.jobId)
        .sort((left, right) => left - right)
        .join(","),
    [jobsById],
  );

  useEffect(() => {
    const tabId = tabIdRef.current;

    if (!storageNamespace || !pollingLeaseKey || !tabId) {
      return;
    }

    let isDisposed = false;

    const pollActiveJobs = async () => {
      const now = Date.now();
      const currentLeaseValue = window.localStorage.getItem(pollingLeaseKey);
      let currentLease: PollingLease | null = null;

      try {
        currentLease = currentLeaseValue
          ? (JSON.parse(currentLeaseValue) as PollingLease)
          : null;
      } catch {
        currentLease = null;
      }

      if (
        currentLease &&
        currentLease.ownerId !== tabId &&
        currentLease.expiresAt > now
      ) {
        return;
      }

      const nextLease: PollingLease = {
        ownerId: tabId,
        expiresAt: now + POLLING_LEASE_DURATION_MS,
      };
      window.localStorage.setItem(pollingLeaseKey, JSON.stringify(nextLease));

      const acquiredLease = JSON.parse(
        window.localStorage.getItem(pollingLeaseKey) ?? "null",
      ) as PollingLease | null;
      if (acquiredLease?.ownerId !== tabId) {
        return;
      }

      const activeJobs = Object.values(jobsRef.current).filter((job) =>
        ACTIVE_STATUSES.has(normalizeStatus(job.status)),
      );

      await Promise.allSettled(
        activeJobs.map(async (trackedJob) => {
          const remoteJob = await getRerunReviewJobStatus(trackedJob.jobId);

          if (isDisposed) {
            return;
          }

          queryClient.setQueryData(
            ["rerun-review-job", trackedJob.jobId],
            remoteJob,
          );

          const nextStatus = normalizeStatus(remoteJob.jobStatus);

          if (
            normalizeStatus(trackedJob.status) === nextStatus &&
            trackedJob.aiResponseId === remoteJob.aiResponseId &&
            trackedJob.errorMessage === remoteJob.errorMessage &&
            trackedJob.scheduledAt === remoteJob.scheduledAt &&
            trackedJob.startedAt === remoteJob.startedAt &&
            trackedJob.completedAt === remoteJob.completedAt
          ) {
            return;
          }

          updateJob(trackedJob.jobId, {
            status: nextStatus,
            aiResponseId:
              remoteJob.result?.aiResponseId ?? remoteJob.aiResponseId,
            errorMessage: remoteJob.errorMessage,
            scheduledAt: remoteJob.scheduledAt,
            startedAt: remoteJob.startedAt,
            completedAt: remoteJob.completedAt,
          });
        }),
      );
    };

    void pollActiveJobs();
    const intervalId = window.setInterval(pollActiveJobs, POLL_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);

      const leaseValue = window.localStorage.getItem(pollingLeaseKey);
      try {
        const lease = leaseValue
          ? (JSON.parse(leaseValue) as PollingLease)
          : null;
        if (lease?.ownerId === tabId) {
          window.localStorage.removeItem(pollingLeaseKey);
        }
      } catch {
        window.localStorage.removeItem(pollingLeaseKey);
      }
    };
  }, [
    activeJobIdsKey,
    pollingLeaseKey,
    queryClient,
    storageNamespace,
    updateJob,
  ]);

  const jobs = useMemo(() => Object.values(jobsById), [jobsById]);

  const value = useMemo<JobRegistryContextValue>(
    () => ({
      jobs,
      registerCaseJob,
      registerPromptJob,
      updateJob,
      removeJob,
      getCaseJob: (caseId) =>
        newestJob(
          jobs.filter(
            (job) => job.kind === "case-review" && job.caseId === caseId,
          ),
        ),
      getPromptJob: (configurationId, promptType) =>
        newestJob(
          jobs.filter(
            (job) =>
              job.kind === "prompt" &&
              job.promptType === promptType &&
              (configurationId === undefined ||
                job.configurationId === undefined ||
                job.configurationId === configurationId),
          ),
        ),
      getPromptFile: (configurationId) =>
        promptFilesRef.current[String(configurationId ?? "current")],
    }),
    [jobs, registerCaseJob, registerPromptJob, removeJob, updateJob],
  );

  return (
    <JobRegistryContext.Provider value={value}>
      {children}
    </JobRegistryContext.Provider>
  );
}
