//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  IconAlertCircleFilled,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconFileText,
  IconInfoCircle,
  IconLoader2,
  IconSearch,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { toast, Toaster } from "sonner";

import SelectDropdown from "@/components/common/SelectDropdown";
import {
  showUploadErrorToast,
  showUploadSuccessToast,
} from "@/components/ToastNotifications/UploadFeedbackToast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useJobRegistry } from "@/context/useJobRegistry";
import { toTestIdSegment } from "@/lib/utils";
import {
  cancelRerunCaseReview,
  getCaseDocumentSubmittedByOptions,
  getCurrentPromptConfiguration,
  getReviewDetail,
  getReviewHistory,
  getReviewQueue,
  getReviewVersion,
  rerunCaseReview,
  type CaseDocumentSubmittedByOption,
  type CaseReviewDetailItem,
  type CaseSubmittedBy,
  type CurrentPromptConfigurationItem,
  type ReviewHistoryItem,
  type ReviewQueueItem,
} from "@/services";
import {
  buildCitationPreviewUrl,
  buildDocumentPreviewUrl,
} from "@/services/documentPreview";

interface CaseReviewLocationState {
  reviewCase?: ReviewQueueItem;
}

interface ManageDocumentItem {
  id: string;
  documentId: number | null;
  documentName: string;
  submittedBy: CaseSubmittedBy;
  isTransactionEvidence: boolean;
  fileSize: number | null;
  isNew: boolean;
  isDeleted: boolean;
  file?: File;
}

const REVIEW_QUEUE_QUERY_KEY = ["review-queue"] as const;
const REVIEW_QUERY_CACHE_TIME = Infinity;
const MAX_MANAGE_DOCUMENT_COUNT = 10;
const MAX_MANAGE_DOCUMENT_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MANAGE_DOCUMENTS_TOASTER_ID = "manage-documents";
const QUEUED_RERUN_JOB_STATUSES = new Set(["QUEUED", "PENDING", "SCHEDULED"]);
const ACTIVE_RERUN_JOB_STATUSES = new Set([
  ...QUEUED_RERUN_JOB_STATUSES,
  "PROCESSING",
  "IN_PROGRESS",
  "RUNNING",
  "ANALYZING",
  "RETRY",
  "RETRYING",
]);
const TERMINAL_RERUN_JOB_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "ERROR",
  "CANCELED",
  "CANCELLED",
]);
const CANCELED_RERUN_JOB_STATUSES = new Set(["CANCELED", "CANCELLED"]);
type ReviewJobDisplayState = "queued" | "in-progress";
type ManageDocumentColumnKey =
  | "documentName"
  | "transactionEvidence"
  | "submittedBy"
  | "size";
interface ManageDocumentSortConfig {
  key: ManageDocumentColumnKey;
  direction: "asc" | "desc";
}
type ReviewedDocumentColumnKey =
  | "documentName"
  | "transactionEvidence"
  | "submittedBy"
  | "size";
interface ReviewedDocumentSortConfig {
  key: ReviewedDocumentColumnKey;
  direction: "asc" | "desc";
}

function normalizeDocumentName(documentName: string) {
  return documentName.trim().toLowerCase();
}

function getReviewJobDisplayState(
  status: string | null | undefined,
): ReviewJobDisplayState | null {
  const normalizedStatus = status?.trim().toUpperCase() ?? "";

  if (QUEUED_RERUN_JOB_STATUSES.has(normalizedStatus)) {
    return "queued";
  }

  if (
    normalizedStatus === "PROCESSING" ||
    normalizedStatus === "IN_PROGRESS" ||
    normalizedStatus === "RUNNING" ||
    normalizedStatus === "ANALYZING" ||
    normalizedStatus === "RETRY" ||
    normalizedStatus === "RETRYING"
  ) {
    return "in-progress";
  }

  return null;
}

function normalizeSubmittedBy(
  submittedBy: string | null | undefined,
  fallback: CaseSubmittedBy,
): CaseSubmittedBy {
  const normalizedSubmittedBy = submittedBy?.trim().toUpperCase();

  if (normalizedSubmittedBy === "D" || normalizedSubmittedBy === "DEFENDANT") {
    return "D";
  }

  if (normalizedSubmittedBy === "P" || normalizedSubmittedBy === "PLAINTIFF") {
    return "P";
  }

  return fallback;
}

function ManageDocumentsSortButton({
  columnKey,
  label,
  sortConfig,
  onSort,
}: {
  columnKey: ManageDocumentColumnKey;
  label: string;
  sortConfig: ManageDocumentSortConfig;
  onSort: (columnKey: ManageDocumentColumnKey) => void;
}) {
  const isActive = sortConfig.key === columnKey;
  const sortLabel = isActive
    ? sortConfig.direction === "asc"
      ? "sorted ascending"
      : "sorted descending"
    : "sort";

  return (
    <button
      aria-label={`${label} ${sortLabel}`}
      className="inline-flex size-4 shrink-0 items-center justify-center p-0 text-[#272423] transition-colors hover:text-[#111827]"
      type="button"
      onClick={() => onSort(columnKey)}
    >
      {isActive && sortConfig.direction === "desc" ? (
        <IconArrowDown size={13} className="shrink-0 text-[#272423]" />
      ) : (
        <IconArrowUp
          size={13}
          className={`shrink-0 ${isActive ? "text-[#272423]" : "text-[#c6bfbd]"}`}
        />
      )}
    </button>
  );
}

function ReviewedDocumentsSortButton({
  columnKey,
  label,
  sortConfig,
  onSort,
}: {
  columnKey: ReviewedDocumentColumnKey;
  label: string;
  sortConfig: ReviewedDocumentSortConfig;
  onSort: (columnKey: ReviewedDocumentColumnKey) => void;
}) {
  const isActive = sortConfig.key === columnKey;
  const sortLabel = isActive
    ? sortConfig.direction === "asc"
      ? "sorted ascending"
      : "sorted descending"
    : "sort";

  return (
    <button
      aria-label={`${label} ${sortLabel}`}
      className="inline-flex size-4 shrink-0 items-center justify-center p-0 text-[#272423] transition-colors hover:text-[#111827]"
      type="button"
      onClick={() => onSort(columnKey)}
    >
      {isActive && sortConfig.direction === "desc" ? (
        <IconArrowDown size={13} className="shrink-0 text-[#272423]" />
      ) : (
        <IconArrowUp
          size={13}
          className={`shrink-0 ${isActive ? "text-[#272423]" : "text-[#c6bfbd]"}`}
        />
      )}
    </button>
  );
}

function formatDate(dateValue: string) {
  if (!dateValue) {
    return "--";
  }

  const [year, month, day] = dateValue.split("-");
  return `${month}/${day}/${year}`;
}

function formatLongDateTime(dateValue: string) {
  if (!dateValue) {
    return "--";
  }

  const normalizedDateValue = dateValue.includes("T")
    ? dateValue
    : `${dateValue}T19:18:00`;
  const parsedDate = new Date(normalizedDateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsedDate);
}

function formatFileSize(bytes: number | null | undefined) {
  if (!Number.isFinite(bytes ?? NaN) || (bytes ?? 0) <= 0) {
    return "0 B";
  }

  const value = bytes ?? 0;
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );

  return `${(value / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function firstNonEmptyString(...values: (string | null | undefined)[]) {
  for (const value of values) {
    const normalizedValue = value?.trim();

    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return "";
}

function formatReviewText(value: string | null | undefined) {
  return (
    value
      ?.replace(/[\uE000-\uF8FF]filecite.?/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .trim() ?? ""
  );
}

const markdownPreviewClassName = [
  "text-[#2b2b2b]",
  "leading-[1.75]",
  "[&_*]:font-[inherit]",
  "[&_h1]:m-0",
  "[&_h1]:mb-3",
  "[&_h1]:mt-0",
  "[&_h1]:text-[24px]",
  "[&_h1]:leading-[32px]",
  "[&_h1]:font-semibold",
  "[&_h2]:m-0",
  "[&_h2]:mb-3",
  "[&_h2]:mt-4",
  "[&_h2]:text-[20px]",
  "[&_h2]:leading-[28px]",
  "[&_h2]:font-semibold",
  "[&_h3]:m-0",
  "[&_h3]:mb-2",
  "[&_h3]:mt-4",
  "[&_h3]:text-[18px]",
  "[&_h3]:leading-[26px]",
  "[&_h3]:font-semibold",
  "[&_h4]:m-0",
  "[&_h4]:mb-2",
  "[&_h4]:mt-4",
  "[&_h4]:text-[16px]",
  "[&_h4]:leading-[24px]",
  "[&_h4]:font-semibold",
  "[&_h5]:m-0",
  "[&_h5]:mb-2",
  "[&_h5]:mt-3",
  "[&_h5]:text-[14px]",
  "[&_h5]:leading-[22px]",
  "[&_h5]:font-semibold",
  "[&_h6]:m-0",
  "[&_h6]:mb-2",
  "[&_h6]:mt-3",
  "[&_h6]:text-[13px]",
  "[&_h6]:leading-[20px]",
  "[&_h6]:font-semibold",
  "[&_p]:my-2",
  "[&_p]:text-[14px]",
  "[&_p]:leading-6",
  "[&_p]:whitespace-pre-line",
  "[&_a]:text-[#01579b]",
  "[&_a]:underline",
  "[&_a]:underline-offset-[0.15em]",
  "[&_a]:break-words",
  "[&_a]:transition",
  "[&_a:hover]:text-[#124bb5]",
  "[&_strong]:font-semibold",
  "[&_em]:italic",
  "[&_small]:text-[12px]",
  "[&_small]:leading-5",
  "[&_sup]:align-super",
  "[&_sup]:text-[12px]",
  "[&_sub]:align-sub",
  "[&_sub]:text-[12px]",
  "[&_blockquote]:my-4",
  "[&_blockquote]:border-l-4",
  "[&_blockquote]:border-[#d6d8db]",
  "[&_blockquote]:pl-4",
  "[&_blockquote]:text-[#4b5563]",
  "[&_hr]:my-4",
  "[&_hr]:border-[#d6d8db]",
  "[&_ul]:my-2",
  "[&_ul]:list-disc",
  "[&_ul]:pl-6",
  "[&_ol]:my-2",
  "[&_ol]:list-decimal",
  "[&_ol]:pl-6",
  "[&_li]:my-1",
  "[&_li]:text-[14px]",
  "[&_li]:leading-6",
  "[&_dl]:my-2",
  "[&_dt]:mt-2",
  "[&_dt]:font-semibold",
  "[&_dd]:ml-4",
  "[&_table]:my-4",
  "[&_table]:w-full",
  "[&_table]:border-collapse",
  "[&_table]:text-[14px]",
  "[&_th]:border",
  "[&_th]:border-[#d6d8db]",
  "[&_th]:bg-[#f8f8f9]",
  "[&_th]:px-3",
  "[&_th]:py-2",
  "[&_th]:text-left",
  "[&_th]:font-semibold",
  "[&_td]:border",
  "[&_td]:border-[#d6d8db]",
  "[&_td]:px-3",
  "[&_td]:py-2",
  "[&_code]:rounded",
  "[&_code]:bg-[#f8f8f9]",
  "[&_code]:px-1.5",
  "[&_code]:py-0.5",
  "[&_code]:font-mono",
  "[&_code]:text-[12px]",
  "[&_pre]:my-3",
  "[&_pre]:overflow-x-auto",
  "[&_pre]:rounded-md",
  "[&_pre]:border",
  "[&_pre]:border-[#d6d8db]",
  "[&_pre]:bg-[#f8f8f9]",
  "[&_pre]:p-3",
  "[&_pre]:font-mono",
  "[&_pre]:whitespace-pre-wrap",
  "[&_pre]:break-words",
  "[&_pre_code]:bg-transparent",
  "[&_pre_code]:p-0",
  "[&_pre_code]:text-[12px]",
  "[&_img]:my-3",
  "[&_img]:block",
  "[&_img]:max-w-full",
  "[&_img]:h-auto",
  "[&_img]:rounded-md",
  "[&_figure]:my-4",
  "[&_figcaption]:mt-2",
  "[&_figcaption]:text-[12px]",
  "[&_figcaption]:leading-5",
  "[&_figcaption]:text-[#6b7280]",
  "[&_mark]:rounded",
  "[&_mark]:bg-[#fff3bf]",
  "[&_mark]:px-1",
  "[&_kbd]:rounded",
  "[&_kbd]:border",
  "[&_kbd]:border-[#d6d8db]",
  "[&_kbd]:bg-white",
  "[&_kbd]:px-1.5",
  "[&_kbd]:py-0.5",
  "[&_kbd]:font-mono",
  "[&_kbd]:text-[12px]",
  "[&_samp]:font-mono",
  "[&_var]:italic",
  "[&_address]:not-italic",
  "[&_details]:my-3",
  "[&_summary]:cursor-pointer",
  "[&_summary]:font-semibold",
  "[&_br]:leading-none",
].join(" ");

function MarkdownOutput({ value, caseId }: { value: string; caseId: number }) {
  const cleanedValue = value
    .replace(/[ \t]+\r?\n/g, "\n")
    .replace(/\r\n/g, "\n");

  return (
    <div className={markdownPreviewClassName}>
      <ReactMarkdown
        components={{
          a: ({ children, href, title }) => {
            const previewUrl = buildCitationPreviewUrl(href, caseId);

            return (
              <a
                href={previewUrl}
                title={title}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
        }}
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
      >
        {cleanedValue}
      </ReactMarkdown>
    </div>
  );
}

function buildSummary(
  reviewDetail: CaseReviewDetailItem | null,
  reviewCase?: ReviewQueueItem,
) {
  const queueSummary = reviewCase?.summary?.trim();

  // The review queue maps a missing summary to the literal string "null".
  if (queueSummary && queueSummary !== "null") {
    return queueSummary;
  }

  if (!reviewDetail?.fullAiReview) {
    return "No summary content available.";
  }

  const normalizedReview = reviewDetail.fullAiReview
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (!normalizedReview) {
    return "No summary content available.";
  }

  return normalizedReview.length > 220
    ? `${normalizedReview.slice(0, 220).trim()}...`
    : normalizedReview;
}

function buildManageDocuments(
  reviewDetail: CaseReviewDetailItem | null,
  fallbackDocuments: ReviewQueueItem["documents"] | undefined,
): ManageDocumentItem[] {
  if (reviewDetail?.documents.length) {
    return reviewDetail.documents.map((document, index) => ({
      id: String(document.aiResponseDocumentId),
      documentId: document.documentId,
      documentName: document.documentName,
      submittedBy: normalizeSubmittedBy(
        document.submittedBy,
        index % 2 === 0 ? "P" : "D",
      ),
      isTransactionEvidence: document.isTransactionEvidenceDocument,
      fileSize: document.fileSize,
      isNew: false,
      isDeleted: false,
    }));
  }

  if (fallbackDocuments?.length) {
    return fallbackDocuments.map((document, index) => ({
      id: String(document.aiResponseDocumentId ?? document.documentName),
      documentId: document.documentId ?? null,
      documentName: document.documentName,
      submittedBy: index % 2 === 0 ? "P" : "D",
      isTransactionEvidence: false,
      fileSize: null,
      isNew: false,
      isDeleted: false,
    }));
  }

  return [];
}

function getManageDocumentSnapshot(documents: ManageDocumentItem[]) {
  return documents.map((document) => ({
    id: document.id,
    documentName: document.documentName,
    submittedBy: document.submittedBy,
    isTransactionEvidence: document.isTransactionEvidence,
    fileSize: document.fileSize,
    isNew: document.isNew,
    isDeleted: document.isDeleted,
  }));
}

export default function CaseReview() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  const { state } = useLocation() as { state?: CaseReviewLocationState };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { getCaseJob, registerCaseJob, removeJob, updateJob } =
    useJobRegistry();
  const documentsReviewedSectionRef = useRef<HTMLElement | null>(null);
  const manageDocumentsInputRef = useRef<HTMLInputElement | null>(null);
  const routeCaseId = Number(caseId);
  const cachedReviewQueue =
    queryClient.getQueryData<ReviewQueueItem[]>(REVIEW_QUEUE_QUERY_KEY) ?? [];
  const {
    data: reviewQueue = cachedReviewQueue,
    isLoading: isLoadingReviewQueue,
    error: reviewQueueError,
  } = useQuery<ReviewQueueItem[]>({
    queryKey: REVIEW_QUEUE_QUERY_KEY,
    queryFn: getReviewQueue,
    staleTime: REVIEW_QUERY_CACHE_TIME,
    gcTime: REVIEW_QUERY_CACHE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const cachedReviewCase =
    (state?.reviewCase?.caseId === routeCaseId
      ? state.reviewCase
      : undefined) ??
    reviewQueue.find((reviewCase) => reviewCase.caseId === routeCaseId);
  const routeAiResponseId = cachedReviewCase?.aiResponseId ?? 0;
  const {
    data: reviewDetail = null,
    isLoading: isLoadingReviewDetail,
    error: reviewDetailError,
  } = useQuery<CaseReviewDetailItem>({
    queryKey: ["review-detail", routeAiResponseId],
    queryFn: () => getReviewDetail(routeAiResponseId),
    enabled: Number.isFinite(routeAiResponseId) && routeAiResponseId > 0,
    staleTime: REVIEW_QUERY_CACHE_TIME,
    gcTime: REVIEW_QUERY_CACHE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data: currentPromptConfiguration = null } =
    useQuery<CurrentPromptConfigurationItem>({
      queryKey: ["prompt-configuration", "current"],
      queryFn: getCurrentPromptConfiguration,
      staleTime: REVIEW_QUERY_CACHE_TIME,
      gcTime: REVIEW_QUERY_CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  const { data: submittedByOptions } = useQuery<
    CaseDocumentSubmittedByOption[]
  >({
    queryKey: ["case-documents", "submitted-by"],
    queryFn: getCaseDocumentSubmittedByOptions,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const reviewCaseId = routeCaseId;
  const trackedCaseJob = getCaseJob(reviewCaseId);
  const { data: reviewHistory = [] } = useQuery<ReviewHistoryItem[]>({
    queryKey: ["review-history", reviewCaseId],
    queryFn: () => getReviewHistory(reviewCaseId),
    enabled: Number.isFinite(reviewCaseId) && reviewCaseId > 0,
    staleTime: REVIEW_QUERY_CACHE_TIME,
    gcTime: REVIEW_QUERY_CACHE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const requestedReviewVersion = Number(searchParams.get("version"));
  const selectedReviewVersionNumber =
    Number.isSafeInteger(requestedReviewVersion) && requestedReviewVersion > 0
      ? requestedReviewVersion
      : (reviewHistory.find((version) => version.isCurrent)?.reviewVersion ??
        reviewDetail?.reviewVersion ??
        null);
  const { data: selectedReviewVersionDetail = null } =
    useQuery<CaseReviewDetailItem>({
      queryKey: ["review-version", reviewCaseId, selectedReviewVersionNumber],
      queryFn: () =>
        getReviewVersion(reviewCaseId, selectedReviewVersionNumber!),
      enabled:
        Number.isFinite(reviewCaseId) &&
        reviewCaseId > 0 &&
        typeof selectedReviewVersionNumber === "number",
      staleTime: REVIEW_QUERY_CACHE_TIME,
      gcTime: REVIEW_QUERY_CACHE_TIME,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });

  const displayedReviewDetail = selectedReviewVersionDetail ?? reviewDetail;

  const caseName =
    displayedReviewDetail?.caseName ?? cachedReviewCase?.caseName ?? "--";
  const caseNumber =
    displayedReviewDetail?.caseNumber ?? cachedReviewCase?.caseNumber ?? "--";
  const filingDate =
    displayedReviewDetail?.filingDate ?? cachedReviewCase?.filingDate ?? "";
  const summary = useMemo(
    () => buildSummary(displayedReviewDetail, cachedReviewCase),
    [displayedReviewDetail, cachedReviewCase],
  );
  const [isManageDocumentsOpen, setIsManageDocumentsOpen] = useState(false);
  const [
    isDiscardManageDocumentsChangesOpen,
    setIsDiscardManageDocumentsChangesOpen,
  ] = useState(false);
  const [manageDocumentsCloseAction, setManageDocumentsCloseAction] = useState<
    "close" | "cancel"
  >("close");
  const [isReviewHistoryOpen, setIsReviewHistoryOpen] = useState(false);
  const [reviewHistorySearch, setReviewHistorySearch] = useState("");
  const [isRerunInProgress, setIsRerunInProgress] = useState(false);
  const [reviewJobBannerStatus, setReviewJobBannerStatus] = useState<
    string | null
  >(null);
  const [activeRerunJobId, setActiveRerunJobId] = useState<number | null>(null);
  const [reviewJobScheduledAt, setReviewJobScheduledAt] = useState<
    string | null
  >(null);
  const [reviewResultLoadError, setReviewResultLoadError] = useState<
    string | null
  >(null);
  const [isLoadingCompletedReview, setIsLoadingCompletedReview] =
    useState(false);
  const [completedReviewRetryKey, setCompletedReviewRetryKey] = useState(0);
  const finalizedRerunJobIdRef = useRef<number | null>(null);
  const [isCancellingRerunReview, setIsCancellingRerunReview] = useState(false);
  const [isCancellationRequested, setIsCancellationRequested] = useState(false);
  const [committedManageDocuments, setCommittedManageDocuments] = useState<
    ManageDocumentItem[]
  >([]);
  const [draftManageDocuments, setDraftManageDocuments] = useState<
    ManageDocumentItem[]
  >([]);
  const [manageDocumentsUploadError, setManageDocumentsUploadError] =
    useState("");
  const [manageDocumentsSortConfig, setManageDocumentsSortConfig] =
    useState<ManageDocumentSortConfig>({
      key: "documentName",
      direction: "asc",
    });
  const [reviewedDocumentsSortConfig, setReviewedDocumentsSortConfig] =
    useState<ReviewedDocumentSortConfig>({
      key: "documentName",
      direction: "asc",
    });
  const [isSavingRerunReview, setIsSavingRerunReview] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const availableSubmittedByOptions = submittedByOptions?.length
    ? submittedByOptions
    : [
        { value: "P", label: "Plaintiff" },
        { value: "D", label: "Defendant" },
      ];

  useEffect(() => {
    queueMicrotask(() => {
      setActiveRerunJobId(null);
      setReviewJobScheduledAt(null);
      setReviewResultLoadError(null);
      setIsLoadingCompletedReview(false);
      setCompletedReviewRetryKey(0);
      setIsRerunInProgress(false);
      setReviewJobBannerStatus(null);
      setIsCancellationRequested(false);
      finalizedRerunJobIdRef.current = null;
    });
  }, [routeCaseId]);

  useEffect(() => {
    if (!trackedCaseJob) {
      return;
    }

    queueMicrotask(() => {
      const normalizedStatus = trackedCaseJob.status.trim().toUpperCase();
      setActiveRerunJobId(trackedCaseJob.jobId);
      setReviewJobScheduledAt(trackedCaseJob.scheduledAt ?? null);
      setReviewJobBannerStatus(normalizedStatus);
      setIsRerunInProgress(ACTIVE_RERUN_JOB_STATUSES.has(normalizedStatus));
    });
  }, [trackedCaseJob]);

  useEffect(() => {
    if (!trackedCaseJob) {
      return;
    }

    const jobStatus = trackedCaseJob.status.trim().toUpperCase();

    if (ACTIVE_RERUN_JOB_STATUSES.has(jobStatus)) {
      return;
    }

    if (
      !TERMINAL_RERUN_JOB_STATUSES.has(jobStatus) ||
      finalizedRerunJobIdRef.current === trackedCaseJob.jobId
    ) {
      return;
    }

    const completedJobId = trackedCaseJob.jobId;
    finalizedRerunJobIdRef.current = completedJobId;
    queueMicrotask(() => setIsRerunInProgress(false));

    if (jobStatus !== "COMPLETED") {
      if (!CANCELED_RERUN_JOB_STATUSES.has(jobStatus)) {
        removeJob(completedJobId);
      }
      queueMicrotask(() => setActiveRerunJobId(null));
      return;
    }

    const finalAiResponseId = trackedCaseJob.aiResponseId;
    queueMicrotask(() => setIsLoadingCompletedReview(true));

    void (async () => {
      try {
        if (!finalAiResponseId) {
          throw new Error(
            "The completed job did not return an AI response ID.",
          );
        }

        const finalReview = await getReviewDetail(finalAiResponseId);
        queryClient.setQueryData(
          ["review-detail", finalAiResponseId],
          finalReview,
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_QUERY_KEY }),
          queryClient.invalidateQueries({
            queryKey: ["review-history", finalReview.caseId],
          }),
        ]);
        void navigate(`/cases/${finalReview.caseId}`, { replace: true });

        removeJob(completedJobId);
        setReviewResultLoadError(null);
        setActiveRerunJobId(null);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "The completed review could not be loaded.";
        setReviewResultLoadError(message);
      } finally {
        setIsLoadingCompletedReview(false);
      }
    })();
  }, [
    completedReviewRetryKey,
    navigate,
    queryClient,
    removeJob,
    trackedCaseJob,
  ]);

  useEffect(() => {
    queueMicrotask(() => {
      const hasTrackedActiveJob = Boolean(
        trackedCaseJob &&
        ACTIVE_RERUN_JOB_STATUSES.has(
          trackedCaseJob.status.trim().toUpperCase(),
        ),
      );
      const isReviewAnalyzing =
        displayedReviewDetail?.status === "Analyzing" &&
        !isCancellationRequested;

      setIsRerunInProgress(hasTrackedActiveJob || isReviewAnalyzing);
      if (isReviewAnalyzing && !trackedCaseJob) {
        setReviewJobBannerStatus("PROCESSING");
      }
    });
  }, [displayedReviewDetail?.status, isCancellationRequested, trackedCaseJob]);

  useEffect(() => {
    const handleViewportResize = () => {
      setViewportHeight(window.innerHeight);
    };

    handleViewportResize();
    window.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("resize", handleViewportResize);
    };
  }, []);

  useEffect(() => {
    const nextManageDocuments = buildManageDocuments(
      displayedReviewDetail,
      cachedReviewCase?.documents,
    );

    queueMicrotask(() => {
      setCommittedManageDocuments(nextManageDocuments);
      setDraftManageDocuments(nextManageDocuments);
    });
  }, [displayedReviewDetail, cachedReviewCase?.documents]);

  const documentCount = committedManageDocuments.filter(
    (document) => !document.isDeleted,
  ).length
    ? committedManageDocuments.filter((document) => !document.isDeleted).length
    : (displayedReviewDetail?.documents.length ??
      cachedReviewCase?.documents.length ??
      0);
  const activeDraftManageDocumentCount = draftManageDocuments.filter(
    (document) => !document.isDeleted,
  ).length;
  const shouldUseScrollableDocumentList =
    viewportHeight > 0 &&
    (viewportHeight < 900 || draftManageDocuments.length > 2);
  const hasManageDocumentChanges = useMemo(
    () =>
      JSON.stringify(getManageDocumentSnapshot(draftManageDocuments)) !==
      JSON.stringify(getManageDocumentSnapshot(committedManageDocuments)),
    [draftManageDocuments, committedManageDocuments],
  );
  const hasNewManageDocuments = draftManageDocuments.some(
    (document) => document.isNew && !document.isDeleted,
  );
  const canSaveAndRerunReview =
    (hasManageDocumentChanges || hasNewManageDocuments) && !isSavingRerunReview;
  const sortedDraftManageDocuments = useMemo(() => {
    const { key, direction } = manageDocumentsSortConfig;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...draftManageDocuments].sort((leftDocument, rightDocument) => {
      let comparison = 0;

      switch (key) {
        case "documentName":
          comparison = leftDocument.documentName.localeCompare(
            rightDocument.documentName,
            undefined,
            { numeric: true, sensitivity: "base" },
          );
          break;
        case "transactionEvidence":
          comparison =
            Number(leftDocument.isTransactionEvidence) -
            Number(rightDocument.isTransactionEvidence);
          break;
        case "submittedBy":
          comparison = leftDocument.submittedBy.localeCompare(
            rightDocument.submittedBy,
          );
          break;
        case "size":
          comparison =
            (leftDocument.fileSize ?? 0) - (rightDocument.fileSize ?? 0);
          break;
      }

      return comparison * multiplier;
    });
  }, [draftManageDocuments, manageDocumentsSortConfig]);
  const sortedReviewedDocuments = useMemo(() => {
    const documents = displayedReviewDetail?.documents ?? [];
    const { key, direction } = reviewedDocumentsSortConfig;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...documents].sort((leftDocument, rightDocument) => {
      let comparison = 0;

      switch (key) {
        case "documentName":
          comparison = leftDocument.documentName.localeCompare(
            rightDocument.documentName,
            undefined,
            { numeric: true, sensitivity: "base" },
          );
          break;
        case "transactionEvidence":
          comparison =
            Number(leftDocument.isTransactionEvidenceDocument) -
            Number(rightDocument.isTransactionEvidenceDocument);
          break;
        case "submittedBy":
          comparison = (leftDocument.submittedBy ?? "").localeCompare(
            rightDocument.submittedBy ?? "",
            undefined,
            { sensitivity: "base" },
          );
          break;
        case "size":
          comparison =
            (leftDocument.fileSize ?? 0) - (rightDocument.fileSize ?? 0);
          break;
      }

      if (comparison === 0) {
        comparison = leftDocument.documentName.localeCompare(
          rightDocument.documentName,
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      }

      return comparison * multiplier;
    });
  }, [displayedReviewDetail?.documents, reviewedDocumentsSortConfig]);

  const filteredHistoryVersions = useMemo(() => {
    const normalizedSearch = reviewHistorySearch.trim().toLowerCase();
    const availableVersions = reviewHistory;

    if (!normalizedSearch) {
      return availableVersions;
    }

    return availableVersions.filter((version) =>
      `${version.displayLabel} ${version.reviewDate} ${version.reviewVersion} ${version.aiModelName}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [reviewHistorySearch, reviewHistory]);

  const selectedReviewHistoryVersion = reviewHistory.find(
    (version) => version.reviewVersion === selectedReviewVersionNumber,
  );
  const displayedSummary = formatReviewText(
    firstNonEmptyString(displayedReviewDetail?.summaryAiReview, summary) ||
      "No summary content available.",
  );
  const displayedFullReview = formatReviewText(
    firstNonEmptyString(
      displayedReviewDetail?.fullAiReview,
      "No review content available.",
    ) || "No review content available.",
  );
  const reviewVersionNumber =
    displayedReviewDetail?.reviewVersion ??
    selectedReviewHistoryVersion?.reviewVersion ??
    null;
  const reviewJobDisplayState =
    getReviewJobDisplayState(reviewJobBannerStatus) ??
    (!reviewJobBannerStatus && isRerunInProgress ? "in-progress" : null);
  const reviewJobDisplayLabel =
    reviewJobDisplayState === "queued"
      ? "Queued"
      : reviewJobDisplayState === "in-progress"
        ? "In Progress"
        : null;
  const reviewVersionLabel =
    reviewJobDisplayLabel ??
    (reviewVersionNumber === null ? "—" : `v${reviewVersionNumber}`);
  const isCurrentReviewVersion =
    selectedReviewHistoryVersion?.isCurrent ??
    (!searchParams.has("version") &&
      reviewVersionNumber === reviewDetail?.reviewVersion);
  const reviewStatusLabel =
    reviewJobDisplayLabel ?? (isCurrentReviewVersion ? "Current" : "Outdated");
  const reviewStatusDescription =
    reviewJobDisplayState === "queued"
      ? "The review is queued and waiting to start."
      : reviewJobDisplayState === "in-progress"
        ? "Review generation is in progress."
        : isCurrentReviewVersion
          ? "Review is up-to-date with current documents"
          : "";
  const reviewVersionBadgeClass =
    reviewJobDisplayState === "queued"
      ? "bg-[#fff8df] text-[#8a6d00]"
      : reviewJobDisplayState === "in-progress"
        ? "bg-[#eef2ff] text-[#4f46e5]"
        : isCurrentReviewVersion
          ? "bg-[#e9fbef] text-[#22a35a]"
          : "bg-[#fff8df] text-[#8a6d00]";
  const reviewStatusDotClass =
    reviewJobDisplayState === "queued"
      ? "bg-[#e0a800]"
      : reviewJobDisplayState === "in-progress"
        ? "bg-[#4f46e5]"
        : isCurrentReviewVersion
          ? "bg-[#33c469]"
          : "bg-[#e5bd32]";
  const generatedOnLabel =
    reviewJobDisplayState || isLoadingCompletedReview
      ? ""
      : formatLongDateTime(displayedReviewDetail?.reviewDate ?? "");
  const shouldUseRerunScheduledAt =
    Boolean(reviewJobDisplayState) ||
    reviewJobBannerStatus?.trim().toUpperCase() === "COMPLETED";
  const scheduledAtValue = searchParams.has("version")
    ? (displayedReviewDetail?.scheduledAt ?? "")
    : shouldUseRerunScheduledAt
      ? (trackedCaseJob?.scheduledAt ??
        reviewJobScheduledAt ??
        displayedReviewDetail?.scheduledAt ??
        "")
      : (displayedReviewDetail?.scheduledAt ?? "");
  const startedOnLabel = scheduledAtValue
    ? formatLongDateTime(scheduledAtValue)
    : "";
  const documentsChangedOnLabel = formatLongDateTime(
    trackedCaseJob?.scheduledAt ??
      trackedCaseJob?.startedAt ??
      reviewJobScheduledAt ??
      reviewDetail?.reviewDate ??
      "",
  );
  const outdatedDocumentsChangedOnLabel = formatLongDateTime(
    reviewDetail?.createdDttm ?? reviewDetail?.reviewDate ?? "",
  );

  const handleRemoveManagedDocument = (documentId: string) => {
    setDraftManageDocuments((currentDocuments) =>
      currentDocuments.flatMap((document) => {
        if (document.id !== documentId) {
          return [document];
        }

        if (document.isNew) {
          return [];
        }

        return [{ ...document, isDeleted: true }];
      }),
    );
  };

  const handleUndoRemovedManagedDocument = (documentId: string) => {
    setDraftManageDocuments((currentDocuments) =>
      currentDocuments.map((document) =>
        document.id === documentId
          ? { ...document, isDeleted: false }
          : document,
      ),
    );
  };

  const handleManageSubmittedByChange = (
    documentId: string,
    submittedBy: CaseSubmittedBy,
  ) => {
    setDraftManageDocuments((currentDocuments) =>
      currentDocuments.map((document) =>
        document.id === documentId ? { ...document, submittedBy } : document,
      ),
    );
  };

  const handleManageTransactionEvidenceChange = (
    documentId: string,
    isTransactionEvidence: boolean,
  ) => {
    setDraftManageDocuments((currentDocuments) =>
      currentDocuments.map((document) =>
        document.id === documentId
          ? { ...document, isTransactionEvidence }
          : document,
      ),
    );
  };

  const handleManageDocumentsSort = (columnKey: ManageDocumentColumnKey) => {
    setManageDocumentsSortConfig((currentSort) => ({
      key: columnKey,
      direction:
        currentSort.key === columnKey && currentSort.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const handleReviewedDocumentsSort = (
    columnKey: ReviewedDocumentColumnKey,
  ) => {
    setReviewedDocumentsSortConfig((currentSort) => ({
      key: columnKey,
      direction:
        currentSort.key === columnKey && currentSort.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const handleScrollToDocumentsReviewed = () => {
    documentsReviewedSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleOpenDocumentContent = (documentId: number) => {
    const viewerUrl = buildDocumentPreviewUrl(routeCaseId, documentId);
    const openLink = document.createElement("a");

    openLink.href = viewerUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.style.display = "none";

    document.body.appendChild(openLink);
    openLink.click();
    openLink.remove();
  };

  const handleOpenManageDocumentsPicker = () => {
    manageDocumentsInputRef.current?.click();
  };

  const closeManageDocumentsDialog = () => {
    setDraftManageDocuments(committedManageDocuments);
    setManageDocumentsUploadError("");
    setIsDiscardManageDocumentsChangesOpen(false);
    setManageDocumentsCloseAction("close");
    setIsManageDocumentsOpen(false);
  };

  const requestManageDocumentsDialogClose = (
    action: "close" | "cancel" = "close",
  ) => {
    if (isSavingRerunReview) {
      return;
    }

    if (hasManageDocumentChanges || hasNewManageDocuments) {
      setManageDocumentsCloseAction(action);
      setIsDiscardManageDocumentsChangesOpen(true);
      return;
    }

    closeManageDocumentsDialog();
  };

  const handleManageDocumentsDialogOpenChange = (open: boolean) => {
    if (open) {
      setDraftManageDocuments(committedManageDocuments);
      setManageDocumentsUploadError("");
      setIsManageDocumentsOpen(true);
      return;
    }

    requestManageDocumentsDialogClose();
  };

  const handleManageDocumentsUpload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    setManageDocumentsUploadError("");

    if (!selectedFiles.length) {
      return;
    }

    const invalidFiles = selectedFiles.filter(
      (file) => file.type !== "application/pdf",
    );

    if (invalidFiles.length > 0) {
      showUploadErrorToast(
        "Invalid file type. Please upload PDF files only.",
        handleOpenManageDocumentsPicker,
        MANAGE_DOCUMENTS_TOASTER_ID,
      );
      return;
    }

    if (
      selectedFiles.some(
        (file) => file.size > MAX_MANAGE_DOCUMENT_FILE_SIZE_BYTES,
      )
    ) {
      setManageDocumentsUploadError("File too large. Max file size 100MB.");
      return;
    }

    const activeDocumentNames = new Set(
      draftManageDocuments
        .filter((document) => !document.isDeleted)
        .map((document) => normalizeDocumentName(document.documentName)),
    );
    const selectedDocumentNames = new Set<string>();
    const duplicateFile = selectedFiles.find((file) => {
      const normalizedName = normalizeDocumentName(file.name);

      if (
        activeDocumentNames.has(normalizedName) ||
        selectedDocumentNames.has(normalizedName)
      ) {
        return true;
      }

      selectedDocumentNames.add(normalizedName);
      return false;
    });

    if (duplicateFile) {
      showUploadErrorToast(
        `A file named ${duplicateFile.name} has already been uploaded.`,
        handleOpenManageDocumentsPicker,
        MANAGE_DOCUMENTS_TOASTER_ID,
      );
      return;
    }

    if (
      activeDraftManageDocumentCount + selectedFiles.length >
      MAX_MANAGE_DOCUMENT_COUNT
    ) {
      showUploadErrorToast(
        "You can upload up to 10 files.",
        handleOpenManageDocumentsPicker,
        MANAGE_DOCUMENTS_TOASTER_ID,
      );
      return;
    }

    const uploadedDocuments = selectedFiles.map((file, index) => ({
      id: `uploaded-${file.name}-${file.lastModified}-${index}`,
      documentId: null,
      documentName: file.name,
      submittedBy: (availableSubmittedByOptions[0]?.value ??
        "P") as CaseSubmittedBy,
      isTransactionEvidence: false,
      fileSize: file.size,
      isNew: true,
      isDeleted: false,
      file,
    }));

    setDraftManageDocuments((currentDocuments) => [
      ...uploadedDocuments,
      ...currentDocuments,
    ]);
    showUploadSuccessToast(
      selectedFiles.map((file) => file.name),
      MANAGE_DOCUMENTS_TOASTER_ID,
    );
  };

  const handleSaveAndRerunReview = async () => {
    const remainingDraftDocuments = draftManageDocuments.filter(
      (document) => !document.isDeleted,
    );
    const caseId = Number(
      cachedReviewCase?.caseId ?? reviewDetail?.caseId ?? 0,
    );
    const promptConfigurationId =
      currentPromptConfiguration?.promptConfigurationId;

    if (!caseId || !promptConfigurationId) {
      toast.error("Unable to rerun review. Missing prompt configuration.");
      return;
    }

    // An empty document list makes the API fall back to every case document.
    if (!remainingDraftDocuments.length) {
      toast.error("Unable to rerun review. Add at least one document.");
      return;
    }

    setIsSavingRerunReview(true);

    try {
      const rerunResponse = await rerunCaseReview(caseId, {
        promptConfigurationId,
        documents: remainingDraftDocuments.map((document) => ({
          documentId: document.isNew
            ? undefined
            : (document.documentId ?? undefined),
          document: document.isNew ? document.file : undefined,
          submittedBy: document.submittedBy,
          isTransactionEvidence: document.isTransactionEvidence,
        })),
      });

      setCommittedManageDocuments(remainingDraftDocuments);
      setDraftManageDocuments(remainingDraftDocuments);
      setIsManageDocumentsOpen(false);
      setIsRerunInProgress(true);
      setReviewJobBannerStatus(rerunResponse.jobStatus);
      setReviewJobScheduledAt(rerunResponse.scheduledAt);
      registerCaseJob({
        jobId: rerunResponse.jobId,
        caseId,
        status: rerunResponse.jobStatus,
        aiResponseId: rerunResponse.aiResponseId,
        scheduledAt: rerunResponse.scheduledAt,
      });
      setActiveRerunJobId(rerunResponse.jobId);
      setReviewResultLoadError(null);
      finalizedRerunJobIdRef.current = null;
      setIsCancellationRequested(false);
    } catch {
      toast.error("Unable to save and rerun review.");
    } finally {
      setIsSavingRerunReview(false);
    }
  };

  const handleRerunCurrentReview = async () => {
    const caseId = Number(
      cachedReviewCase?.caseId ?? reviewDetail?.caseId ?? 0,
    );
    const promptConfigurationId =
      currentPromptConfiguration?.promptConfigurationId;
    const activeDocuments = committedManageDocuments.filter(
      (document) => !document.isDeleted,
    );

    if (!caseId || !promptConfigurationId) {
      toast.error("Unable to rerun review. Missing prompt configuration.");
      return;
    }

    if (!activeDocuments.length) {
      toast.error("Unable to rerun review. No documents available.");
      return;
    }

    setIsSavingRerunReview(true);

    try {
      const rerunResponse = await rerunCaseReview(caseId, {
        promptConfigurationId,
        documents: activeDocuments.map((document) => ({
          documentId: document.documentId ?? undefined,
          document: document.isNew ? document.file : undefined,
          submittedBy: document.submittedBy,
          isTransactionEvidence: document.isTransactionEvidence,
        })),
      });
      setIsRerunInProgress(true);
      setReviewJobBannerStatus(rerunResponse.jobStatus);
      setReviewJobScheduledAt(rerunResponse.scheduledAt);
      registerCaseJob({
        jobId: rerunResponse.jobId,
        caseId,
        status: rerunResponse.jobStatus,
        aiResponseId: rerunResponse.aiResponseId,
        scheduledAt: rerunResponse.scheduledAt,
      });
      setActiveRerunJobId(rerunResponse.jobId);
      setReviewResultLoadError(null);
      finalizedRerunJobIdRef.current = null;
      setIsCancellationRequested(false);
    } catch {
      toast.error("Unable to rerun review.");
    } finally {
      setIsSavingRerunReview(false);
    }
  };

  const handleCancelRerunReview = async () => {
    if (!activeRerunJobId) {
      toast.error("Unable to cancel review. Missing job information.");
      return;
    }

    try {
      setIsCancellingRerunReview(true);
      await cancelRerunCaseReview(activeRerunJobId);

      finalizedRerunJobIdRef.current = activeRerunJobId;
      updateJob(activeRerunJobId, { status: "CANCELED" });
      setIsCancellationRequested(true);
      setIsRerunInProgress(false);
      setReviewJobBannerStatus("CANCELED");
      setActiveRerunJobId(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unable to cancel review.";

      if (message.toLowerCase().includes("already completed")) {
        setIsRerunInProgress(false);
      }
    } finally {
      setIsCancellingRerunReview(false);
    }
  };

  const handleRetryCompletedReview = () => {
    finalizedRerunJobIdRef.current = null;
    setCompletedReviewRetryKey((current) => current + 1);
  };

  const normalizedBannerStatus = reviewJobBannerStatus?.trim().toUpperCase();
  const reviewBannerKind = reviewResultLoadError
    ? "result-error"
    : ["QUEUED", "PENDING", "SCHEDULED"].includes(normalizedBannerStatus ?? "")
      ? "queued"
      : normalizedBannerStatus === "COMPLETED"
        ? "completed"
        : ["CANCELED", "CANCELLED"].includes(normalizedBannerStatus ?? "")
          ? "canceled"
          : ["FAILED", "ERROR"].includes(normalizedBannerStatus ?? "")
            ? "failed"
            : normalizedBannerStatus &&
                ACTIVE_RERUN_JOB_STATUSES.has(normalizedBannerStatus)
              ? "progress"
              : null;
  const reviewBanner =
    reviewBannerKind === "result-error"
      ? {
          title: "Review Completed, but Couldn't Load",
          description:
            "The review finished successfully, but the latest result could not be loaded. Please try loading it again.",
          containerClass: "border-[#ef7777] bg-[#fff0f0]",
          accentClass: "border-[#dc2626] text-[#c81e1e]",
        }
      : reviewBannerKind === "queued"
        ? {
            title: "Review Queued",
            description: "The review is queued. It should start shortly.",
            containerClass: "border-[#e5bd45] bg-[#fffbeb]",
            accentClass: "border-[#e0a800] text-[#9a6b00]",
          }
        : reviewBannerKind === "failed"
          ? {
              title: "Review Failed",
              description:
                "We couldn't generate the review using the latest documents.",
              containerClass: "border-[#ef7777] bg-[#fff0f0]",
              accentClass: "border-[#dc2626] text-[#c81e1e]",
            }
          : reviewBannerKind === "canceled"
            ? {
                title: "Review Canceled",
                description:
                  "The review was canceled. You can try again immediately.",
                containerClass: "border-[#d9d9d9] bg-[#f7f7f8]",
                accentClass: "border-[#6b7280] text-[#374151]",
              }
            : reviewBannerKind === "completed"
              ? {
                  title: "Review Completed",
                  description:
                    "The new review has been generated successfully.",
                  containerClass: "border-[#58c98a] bg-[#effcf4]",
                  accentClass: "border-[#16a05d] text-[#14834e]",
                }
              : reviewBannerKind === "progress"
                ? {
                    title: "Review In Progress",
                    description:
                      "The review is being generated using the latest case documents. This may take about 3-5 minutes.",
                    containerClass: "border-[#7c83ff] bg-[#f3f5ff]",
                    accentClass: "border-[#4f46e5] text-[#4f46e5]",
                  }
                : null;
  const reviewBannerIcon =
    reviewBannerKind === "queued" ? (
      <IconLoader2
        size={20}
        stroke={2.2}
        className="animate-spin text-[#e0a800]"
        aria-hidden="true"
      />
    ) : reviewBannerKind === "progress" ? (
      <IconLoader2
        size={20}
        stroke={2.2}
        className="animate-spin text-[#4f46e5]"
        aria-hidden="true"
      />
    ) : reviewBannerKind === "completed" ? (
      <IconCircleCheckFilled
        size={20}
        className="text-[#16a05d]"
        aria-hidden="true"
      />
    ) : reviewBannerKind === "canceled" ? (
      <IconCircleXFilled
        size={20}
        className="text-[#6b7280]"
        aria-hidden="true"
      />
    ) : reviewBannerKind === "failed" || reviewBannerKind === "result-error" ? (
      <IconAlertCircleFilled
        size={20}
        className="text-[#dc2626]"
        aria-hidden="true"
      />
    ) : null;

  return (
    <div
      className="flex flex-col gap-2.5 self-stretch px-6 pb-8 pt-3 md:px-8 xl:px-16"
      data-qaautomationid="case-review-page"
    >
      <Dialog
        open={isManageDocumentsOpen}
        onOpenChange={handleManageDocumentsDialogOpenChange}
      >
        <DialogContent
          className="flex h-[88vh] max-w-[900px] flex-col gap-0 overflow-hidden rounded-[20px] border border-[#dedad9] bg-white p-0 shadow-[0_24px_60px_rgba(39,36,35,0.18)]"
          hideCloseIcon
          data-qaautomationid="case-review-manage-documents-dialog"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <Toaster id={MANAGE_DOCUMENTS_TOASTER_ID} position="top-center" />
            <input
              ref={manageDocumentsInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleManageDocumentsUpload}
            />
            <div className="border-b border-[#ece7e5] pb-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <DialogTitle className="!text-[18px] font-medium !leading-5 text-foreground">
                    Manage Documents
                  </DialogTitle>
                  <DialogDescription className="text-sm font-normal text-[#574E4D]">
                    Manage the documents used for this case review. Select Save
                    & Re-Run Review to apply changes and generate an updated
                    review.
                  </DialogDescription>
                </div>
                <button
                  type="button"
                  className="text-2xl leading-none text-[#6b7280]"
                  data-qaautomationid="case-review-manage-documents-close-button"
                  onClick={() => handleManageDocumentsDialogOpenChange(false)}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="rounded-[16px] border border-dashed border-[#c9c2bf] px-6 py-5 text-center">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  className="rounded-[10px] !border border-[#c9c2bf] bg-white px-5 py-3 text-sm font-medium text-[#272423]"
                  data-qaautomationid="case-review-manage-documents-browse-button"
                  onClick={handleOpenManageDocumentsPicker}
                >
                  Browse...
                </button>
                <span className="text-lg text-[#272423]">
                  Or drop PDF files here
                </span>
              </div>
              <p className="text-xs font-normal mt-5 leading-[18px] text-[#1E1E1E]">
                Drag and drop files here, or browse to upload from your system.
              </p>
              <p className="text-xs font-normal leading-[18px] text-[#1E1E1E]">
                You can upload up to <b>10 files</b>. Maximum file size:{" "}
                <b>100 MB per file</b>.
              </p>
              {manageDocumentsUploadError ? (
                <p className="mt-3 text-sm leading-5 text-[#cf2a1b]">
                  {manageDocumentsUploadError}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3 text-[15px] text-[#272423]">
              <span className="font-semibold">
                {activeDraftManageDocumentCount} Document Files
              </span>
              <span className="text-[#9ca3af]">-</span>
              <span>
                Properly Categorize Documents Before Running AI Review
              </span>
            </div>

            <div
              className={`overflow-hidden rounded-[12px] border border-[#dedad9] ${
                shouldUseScrollableDocumentList ? "min-h-0 flex-1" : ""
              }`}
            >
              <div
                className={
                  shouldUseScrollableDocumentList
                    ? "h-full overflow-y-auto"
                    : "overflow-visible"
                }
                style={
                  shouldUseScrollableDocumentList
                    ? {
                        maxHeight: "calc(88vh - 360px)",
                      }
                    : undefined
                }
              >
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[#dedad9] bg-[#faf8f8] hover:bg-[#faf8f8]">
                      <TableHead className="px-6 py-4 text-left text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span>Document Name</span>
                          <ManageDocumentsSortButton
                            columnKey="documentName"
                            label="Document Name"
                            sortConfig={manageDocumentsSortConfig}
                            onSort={handleManageDocumentsSort}
                          />
                        </span>
                      </TableHead>
                      <TableHead className="px-4 py-4 text-center text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]">
                        <span className="inline-flex items-center gap-2">
                          <span>Transaction Evidence</span>
                          <span
                            className="inline-flex -translate-y-[1px] text-[#01579b]"
                            title="Mark documents that contain finance or transaction-related evidence so AI can process them with correct context."
                          >
                            <IconInfoCircle
                              size={14}
                              stroke={1.8}
                              aria-hidden="true"
                            />
                          </span>
                          <ManageDocumentsSortButton
                            columnKey="transactionEvidence"
                            label="Transaction Evidence"
                            sortConfig={manageDocumentsSortConfig}
                            onSort={handleManageDocumentsSort}
                          />
                        </span>
                      </TableHead>
                      <TableHead className="px-6 py-4 text-left text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span>Submitted By</span>
                          <ManageDocumentsSortButton
                            columnKey="submittedBy"
                            label="Submitted By"
                            sortConfig={manageDocumentsSortConfig}
                            onSort={handleManageDocumentsSort}
                          />
                        </span>
                      </TableHead>
                      <TableHead className="px-4 py-4 text-center text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span>Size</span>
                          <ManageDocumentsSortButton
                            columnKey="size"
                            label="Size"
                            sortConfig={manageDocumentsSortConfig}
                            onSort={handleManageDocumentsSort}
                          />
                        </span>
                      </TableHead>
                      <TableHead className="w-20 px-6 py-4 text-center text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody data-qaautomationid="case-review-manage-documents-table">
                    {sortedDraftManageDocuments.map((document) => (
                      <TableRow
                        key={document.id}
                        className="hover:bg-white"
                        data-qaautomationid={`case-review-manage-document-row-${toTestIdSegment(document.documentName)}`}
                      >
                        <TableCell
                          className={`border-b border-[#ece7e5] px-6 py-4 text-sm ${
                            document.isDeleted
                              ? "text-[#cf2a1b]"
                              : "text-[#01579b]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {document.isNew ? (
                              <span className="rounded-full border border-[#f5b942] bg-[#fff6da] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#cf8a00]">
                                New
                              </span>
                            ) : null}
                            <a
                              href="#"
                              onClick={(event) => event.preventDefault()}
                              className={
                                document.isDeleted
                                  ? "line-through"
                                  : "underline"
                              }
                              data-qaautomationid={`case-review-manage-document-link-${toTestIdSegment(document.documentName)}`}
                            >
                              {document.documentName}
                            </a>
                          </div>
                        </TableCell>
                        <TableCell className="border-b border-[#ece7e5] px-4 py-4 text-center align-middle">
                          <input
                            type="checkbox"
                            checked={document.isTransactionEvidence}
                            disabled={document.isDeleted}
                            onChange={(event) =>
                              handleManageTransactionEvidenceChange(
                                document.id,
                                event.target.checked,
                              )
                            }
                            aria-label={`Mark ${document.documentName} as transaction evidence`}
                            className="h-4 w-4 cursor-pointer accent-[#01579b] disabled:cursor-not-allowed"
                          />
                        </TableCell>
                        <TableCell className="border-b border-[#ece7e5] px-6 py-4">
                          <SelectDropdown
                            value={document.submittedBy}
                            onChange={(value) =>
                              handleManageSubmittedByChange(
                                document.id,
                                value as CaseSubmittedBy,
                              )
                            }
                            disabled={document.isDeleted}
                            className="h-11"
                            testId={`case-review-manage-submitted-by-${toTestIdSegment(document.documentName)}`}
                            options={availableSubmittedByOptions.map(
                              (option) => ({
                                label: option.label,
                                value: option.value,
                              }),
                            )}
                          />
                        </TableCell>
                        <TableCell
                          className={`border-b border-[#ece7e5] px-4 py-4 text-center text-sm ${
                            document.isDeleted
                              ? "text-[#b6b6b6]"
                              : "text-[#272423]"
                          }`}
                        >
                          {formatFileSize(document.fileSize)}
                        </TableCell>
                        <TableCell className="border-b border-[#ece7e5] px-6 py-4 text-center">
                          {document.isDeleted ? (
                            <button
                              type="button"
                              className="text-xs underline text-[#574e4d]"
                              data-qaautomationid={`case-review-undo-document-button-${toTestIdSegment(document.documentName)}`}
                              onClick={() =>
                                handleUndoRemovedManagedDocument(document.id)
                              }
                            >
                              Undo
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex text-[#574e4d]"
                              title="Delete Document"
                              data-qaautomationid={`case-review-remove-document-button-${toTestIdSegment(document.documentName)}`}
                              onClick={() =>
                                handleRemoveManagedDocument(document.id)
                              }
                            >
                              <IconTrash size={16} stroke={1.8} />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter className="mt-2 flex-row justify-end gap-3 space-x-0 border-t border-[#ece7e5] pt-3">
              <button
                type="button"
                className="rounded-[10px] border border-[#c9c2bf] bg-white px-6 py-3 text-sm font-medium text-[#6b7280]"
                data-qaautomationid="case-review-manage-documents-cancel-button"
                onClick={() => requestManageDocumentsDialogClose("cancel")}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSaveAndRerunReview}
                className={`inline-flex items-center gap-2 rounded-[10px] px-6 py-3 text-sm font-semibold text-white ${
                  canSaveAndRerunReview
                    ? "bg-[#01579b] hover:bg-[#014a80]"
                    : "cursor-not-allowed bg-[#d7e7f4] text-white/80"
                }`}
                data-qaautomationid="case-review-save-rerun-button"
                onClick={() => {
                  void handleSaveAndRerunReview();
                }}
              >
                <IconSparkles size={24} className="shrink-0 text-white" />
                Save & Re-Run Review
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDiscardManageDocumentsChangesOpen}
        onOpenChange={setIsDiscardManageDocumentsChangesOpen}
      >
        <DialogContent
          hideCloseIcon
          className="max-w-[584px] gap-0 rounded-[16px] border border-[#dedad9] bg-white p-7"
          data-qaautomationid="case-review-discard-manage-documents-changes-dialog"
        >
          <DialogTitle className="font-suisse text-[18px] font-semibold leading-7 text-[#272423]">
            {manageDocumentsCloseAction === "cancel"
              ? "Discard document changes?"
              : "Close without re-running review?"}
          </DialogTitle>
          <DialogDescription className="font-suisse text-sm font-normal leading-5 text-[#272423]">
            {manageDocumentsCloseAction === "cancel"
              ? "You have unsaved document changes. If you leave now, these changes will not be saved and the review will not be re-run."
              : "You made changes to the case documents. To keep the review current, save your changes and re-run the review."}
          </DialogDescription>
          <DialogFooter className="mt-5 flex-row justify-end gap-2 space-x-0">
            <button
              type="button"
              className="rounded-[9px] bg-[#0065a8] font-suisse text-sm font-medium leading-5 text-[#F7F6F5] hover:bg-[#00558c]"
              data-qaautomationid="case-review-discard-manage-documents-changes-button"
              onClick={closeManageDocumentsDialog}
            >
              Discard Changes
            </button>
            <button
              type="button"
              className="rounded-[9px] border border-[#272423] bg-whitefont-suisse text-sm font-medium leading-5 text-[#272423] hover:bg-[#f7f7f7]"
              data-qaautomationid="case-review-continue-editing-documents-button"
              onClick={() => setIsDiscardManageDocumentsChangesOpen(false)}
            >
              Continue Editing
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2 text-sm text-[#7d7472]">
        <Link
          className="text-sm font-medium leading-5 underline text-[#01579B]"
          to="/cases"
        >
          Review Queue
        </Link>
        <IconChevronRight size={24} className="text-forground-muted" />
        <span className="text-sm font-normal leading-5 text-[#272423]">
          Case Review
        </span>
      </div>

      <div>
        <div className="flex flex-col gap-5 border-b border-[#ece7e5] pb-5">
          <div className="flex items-center justify-between gap-6">
            <h2 className="min-w-0 flex-1 text-[32px] leading-[38px] font-medium text-[#111827]">
              Case Review : {caseName}
            </h2>

            <div className="flex shrink-0 flex-nowrap items-center gap-3">
              <button
                type="button"
                className="rounded-[10px] !border-[1px] border-[#272423] bg-white px-5 py-3 text-sm font-medium text-[#272423]"
                data-qaautomationid="case-review-manage-documents-button"
                onClick={() => handleManageDocumentsDialogOpenChange(true)}
              >
                Manage Documents
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-medium ${
                  isRerunInProgress || isSavingRerunReview
                    ? "cursor-not-allowed bg-[#8bb8de] text-white/80"
                    : "bg-[#01579b] text-white"
                }`}
                disabled={isRerunInProgress || isSavingRerunReview}
                data-qaautomationid="case-review-rerun-button"
                onClick={() => {
                  void handleRerunCurrentReview();
                }}
              >
                <IconSparkles size={24} className="shrink-0 text-white" />
                Re-Run Review
              </button>
              <Popover
                open={isReviewHistoryOpen}
                onOpenChange={setIsReviewHistoryOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-[10px] !border-[1px] border-[#272423] bg-white px-5 py-3 text-sm font-medium text-[#272423]"
                    data-qaautomationid="case-review-review-history-button"
                  >
                    Review History
                    <IconChevronDown size={16} stroke={1.8} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[276px] overflow-hidden p-0"
                  data-qaautomationid="case-review-review-history-popover"
                >
                  <div className="border-b border-[#ece7e5] p-4">
                    <p className="mb-3 text-base font-semibold text-[#272423]">
                      Review History
                    </p>
                    <div className="relative">
                      <IconSearch
                        size={16}
                        stroke={1.8}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]"
                      />
                      <input
                        value={reviewHistorySearch}
                        onChange={(event) =>
                          setReviewHistorySearch(event.target.value)
                        }
                        placeholder="Search Versions"
                        className="h-11 w-full rounded-[10px] border border-[#d1d5db] bg-white pl-9 pr-3 text-sm text-[#272423] outline-none"
                        data-qaautomationid="case-review-review-history-search"
                      />
                    </div>
                  </div>
                  <div>
                    {filteredHistoryVersions.map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        className="flex w-full items-start gap-1 border-b border-[#ece7e5] px-2 py-1 text-left transition hover:bg-[#faf8f8] !h-auto"
                        data-qaautomationid={`case-review-history-item-${version.aiResponseId}`}
                        onClick={() => {
                          void navigate(
                            version.isCurrent
                              ? `/cases/${version.caseId}`
                              : `/cases/${version.caseId}?version=${version.reviewVersion}`,
                          );
                          setIsReviewHistoryOpen(false);
                        }}
                      >
                        <div className="flex min-w-0 flex-1 gap-1">
                          <div className="pt-0.5">
                            {version.reviewVersion ===
                            selectedReviewVersionNumber ? (
                              <IconCheck size={14} className="text-[#272423]" />
                            ) : (
                              <span className="block h-[14px] w-[14px]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[#272423]">
                              {version.displayLabel}
                            </div>
                            <p className="mt-1 text-sm text-[#4b5563]">
                              {formatLongDateTime(version.reviewDate)}
                            </p>
                            <p className="text-sm text-[#4b5563]">
                              {documentCount} Documents
                            </p>
                          </div>
                        </div>
                        {version.isCurrent ? (
                          <span className="rounded-full bg-[#e9fbef] px-2.5 py-1 text-xs font-semibold text-[#22a35a]">
                            Current
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <div className="p-4 text-sm text-[#4b5563]">
                    Showing all {reviewHistory.length} versions
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {reviewBanner ? (
            <div
              className={`flex flex-col gap-4 rounded-[14px] border px-5 py-4 md:flex-row md:items-center md:justify-between ${reviewBanner.containerClass}`}
              data-qaautomationid={`case-review-${reviewBannerKind}-banner`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
                  {reviewBannerIcon}
                </span>
                <div>
                  <p
                    className={`text-base font-semibold ${reviewBanner.accentClass.split(" ").at(-1)}`}
                  >
                    {reviewBanner.title}
                  </p>
                  <p className="text-base leading-6 text-[#374151]">
                    {reviewBanner.description}
                  </p>
                </div>
              </div>
              {reviewBannerKind === "result-error" ? (
                <button
                  type="button"
                  className="self-start rounded-[10px] bg-[#075eab] px-4 py-2 text-sm font-medium text-white md:self-center"
                  disabled={isLoadingCompletedReview}
                  data-qaautomationid="case-review-retry-load-result-button"
                  onClick={handleRetryCompletedReview}
                >
                  {isLoadingCompletedReview
                    ? "Loading..."
                    : "Load Review Again"}
                </button>
              ) : reviewBannerKind === "failed" ||
                reviewBannerKind === "canceled" ? (
                <button
                  type="button"
                  className="inline-flex self-start items-center justify-center gap-1.5 rounded-[6px] bg-[#075eab] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#064f91] disabled:cursor-not-allowed disabled:opacity-60 md:self-center"
                  disabled={isSavingRerunReview}
                  data-qaautomationid="case-review-retry-rerun-button"
                  onClick={() => {
                    void handleRerunCurrentReview();
                  }}
                >
                  <IconSparkles
                    size={14}
                    className="shrink-0 text-white"
                    aria-hidden="true"
                  />
                  {isSavingRerunReview ? "Retrying..." : "Retry"}
                </button>
              ) : reviewBannerKind === "queued" ||
                reviewBannerKind === "progress" ? (
                <button
                  type="button"
                  className={`inline-flex self-start items-center justify-center rounded-[6px] border border-[#272423] px-3 py-1.5 text-xs font-medium text-[#272423] transition disabled:cursor-not-allowed disabled:opacity-60 md:self-center ${
                    reviewBannerKind === "queued"
                      ? "bg-[#fffbeb] hover:bg-[#fff7d6]"
                      : "bg-[#f3f5ff] hover:bg-[#e9ecff]"
                  }`}
                  disabled={
                    isCancellingRerunReview ||
                    isCancellationRequested ||
                    !activeRerunJobId
                  }
                  data-qaautomationid="case-review-cancel-rerun-button"
                  onClick={() => {
                    void handleCancelRerunReview();
                  }}
                >
                  {isCancellingRerunReview
                    ? "Cancelling..."
                    : isCancellationRequested
                      ? "Cancellation Requested"
                      : "Cancel"}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="grid overflow-hidden rounded-[18px] border border-[#dedad9] bg-white lg:grid-cols-[1.15fr_0.9fr_1.4fr_1.8fr_2.5fr] lg:divide-x lg:divide-y-0 lg:divide-[#d8d2d0]">
            <div className="px-6 py-5">
              <p className="text-base text-[#272423]">Case Number</p>
              <p
                className="mt-2 text-[18px] font-semibold leading-7 text-[#272423]"
                data-qaautomationid="case-review-case-number-value"
              >
                {caseNumber}
              </p>
            </div>
            <div className="border-t border-[#d8d2d0] px-6 py-5 lg:border-t-0">
              <p className="text-base text-[#272423]">Filing Date</p>
              <p
                className="mt-2 text-[18px] font-semibold leading-7 text-[#272423]"
                data-qaautomationid="case-review-filing-date-value"
              >
                {formatDate(filingDate)}
              </p>
            </div>
            <div className="border-t border-[#d8d2d0] px-6 py-5 lg:border-t-0">
              <p className="text-base text-[#272423]">Documents in Review</p>
              <div
                className="mt-2 flex items-center gap-2 text-[18px] font-semibold leading-7 text-[#272423]"
                data-qaautomationid="case-review-documents-in-review-value"
              >
                <IconFileText
                  size={20}
                  stroke={1.8}
                  className="text-[#574e4d]"
                />
                <span>{documentCount} Documents</span>
              </div>
              <button
                type="button"
                className="text-sm underline text-[#01579b] !px-0 !py-0"
                data-qaautomationid="case-review-view-documents-snapshot-button"
                onClick={handleScrollToDocumentsReviewed}
              >
                View documents snapshot
              </button>
            </div>
            <div className="border-t border-[#d8d2d0] px-6 py-5 lg:border-t-0">
              <div className="flex items-center gap-2">
                <p className="text-base text-[#272423]">Review Version</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-sm font-semibold ${reviewVersionBadgeClass}`}
                  data-qaautomationid="case-review-version-value"
                >
                  {reviewVersionLabel}
                </span>
                {!reviewJobDisplayState ? (
                  <span
                    className={`rounded-full px-2.5 py-1 text-sm font-semibold ${
                      isCurrentReviewVersion
                        ? "bg-[#e9fbef] text-[#22a35a]"
                        : "border border-[#e5bd32] bg-[#fff8df] text-[#8a6d00]"
                    }`}
                    data-qaautomationid={`case-review-version-${isCurrentReviewVersion ? "current" : "outdated"}-badge`}
                  >
                    {isCurrentReviewVersion ? "Current" : "Outdated"}
                  </span>
                ) : null}
              </div>
              <div
                className="mt-3 flex items-center gap-2 text-sm text-[#272423]"
                data-qaautomationid="case-review-started-on-value"
              >
                <IconSparkles size={22.5} className="text-[#8b7ae6]" />
                <span>
                  Started on{" "}
                  <span className="font-semibold">{startedOnLabel}</span>
                </span>
              </div>
              <div
                className="mt-1 flex items-center gap-2 text-sm text-[#272423]"
                data-qaautomationid="case-review-generated-on-value"
              >
                <IconSparkles size={22.5} className="text-[#8b7ae6]" />
                <span>
                  Generated on{" "}
                  <span className="font-semibold">{generatedOnLabel}</span>
                </span>
              </div>
            </div>
            <div className="border-t border-[#d8d2d0] px-6 py-5 lg:border-t-0">
              <p className="text-base text-[#272423]">Status</p>
              <div
                className="mt-2 flex items-center gap-2 text-[18px] font-semibold leading-7 text-[#272423]"
                data-qaautomationid="case-review-status-value"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${reviewStatusDotClass}`}
                />
                <span data-qaautomationid="case-review-status-label">
                  {reviewStatusLabel}
                </span>
                {reviewJobDisplayState === "queued" ||
                reviewJobDisplayState === "in-progress" ? (
                  <span className="inline-flex text-[#01579b]">
                    <IconInfoCircle size={16} stroke={1.8} aria-hidden="true" />
                  </span>
                ) : null}
              </div>
              <p
                className="text-sm font-normal leading-5 text-[#272423]"
                data-qaautomationid="case-review-status-description"
              >
                {reviewJobDisplayState === "queued" ||
                reviewJobDisplayState === "in-progress" ||
                (!reviewJobDisplayState && !isCurrentReviewVersion) ? (
                  <>
                    <span className="block">Documents changed on</span>
                    <span className="block font-semibold">
                      {reviewJobDisplayState
                        ? documentsChangedOnLabel
                        : outdatedDocumentsChangedOnLabel}
                    </span>
                  </>
                ) : (
                  reviewStatusDescription
                )}
              </p>
            </div>
          </div>
        </div>

        {isLoadingReviewQueue || isLoadingReviewDetail ? (
          <div className="py-16 text-sm text-[#6c717e]">
            Loading case review...
          </div>
        ) : !Number.isFinite(routeCaseId) || routeCaseId <= 0 ? (
          <div className="py-16 text-sm text-[#cf2a1b]">
            Invalid case selected.
          </div>
        ) : reviewQueueError || reviewDetailError ? (
          <div className="py-16 text-sm text-[#cf2a1b]">
            {reviewDetailError?.message ??
              reviewQueueError?.message ??
              "Unable to load case review details."}
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h3
                  className="text-2xl font-medium leading-[38.4px] tracking-[-0.24px] text-[#333]"
                  data-qaautomationid="case-review-summary-title"
                >
                  Summary
                </h3>
                <span className="inline-flex items-center gap-1 text-base font-medium leading-6">
                  <span className="bg-[linear-gradient(111deg,#434257_-1.28%,#9490DB_44.98%,#434257_130.89%)] bg-clip-text text-transparent">
                    Generated by AI
                  </span>

                  <IconSparkles size={24} className="shrink-0 text-[#9490DB]" />
                </span>
              </div>
              <div className="max-h-[200px] resize-y overflow-y-auto rounded-[8px] border border-[#dedad9] bg-[#faf8f8] px-4 py-4">
                <div data-qaautomationid="case-review-summary-content">
                  <MarkdownOutput
                    value={displayedSummary}
                    caseId={routeCaseId}
                  />
                </div>
              </div>
            </section>

            <section className="mt-6 ">
              <div className="mb-3 flex items-center gap-2">
                <h3
                  className="text-2xl font-medium leading-[38.4px] tracking-[-0.24px] text-[#333]"
                  data-qaautomationid="case-review-full-review-title"
                >
                  Eligibility Review
                </h3>
                <span className="inline-flex items-center gap-1 text-base font-medium leading-6">
                  <span className="bg-[linear-gradient(111deg,#434257_-1.28%,#9490DB_44.98%,#434257_130.89%)] bg-clip-text text-transparent">
                    Generated by AI
                  </span>

                  <IconSparkles size={24} className="shrink-0 text-[#9490DB]" />
                </span>
              </div>
              <div className="min-h-[200px] max-h-[800px] resize-y overflow-y-auto rounded-[8px] border border-[#dedad9] bg-[#faf8f8] px-4 py-4">
                <div data-qaautomationid="case-review-full-review-content">
                  <MarkdownOutput
                    value={displayedFullReview}
                    caseId={routeCaseId}
                  />
                </div>
              </div>
            </section>

            <section className="mt-6" ref={documentsReviewedSectionRef}>
              <h3
                className="text-xl font-medium leading-7 text-[#333]"
                data-qaautomationid="case-review-documents-reviewed-title"
              >
                Reviewed Documents (
                {displayedReviewDetail?.documents.length ?? 0})
              </h3>
              <p
                className="mt-1 flex items-center gap-2 text-sm leading-5 text-[#272423]"
                data-qaautomationid="case-review-documents-reviewed-description"
              >
                <span>These documents were included in Review Version</span>
                <span
                  className={`rounded-[6px] border px-2 py-0.5 text-xs font-medium leading-4 ${
                    isCurrentReviewVersion
                      ? "border-[#bdeccc] bg-[#e9fbef] text-[#22a35a]"
                      : "border-[#e5bd45] bg-[#fff8e6] text-[#9a6b00]"
                  }`}
                  data-qaautomationid="case-review-documents-reviewed-version"
                >
                  {reviewVersionNumber === null
                    ? "--"
                    : `v${reviewVersionNumber}`}
                </span>
              </p>
              <div className="mt-4 overflow-hidden rounded-[16px] border border-[#dedad9] bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[#dedad9] bg-transparent hover:bg-transparent">
                      <TableHead
                        aria-sort={
                          reviewedDocumentsSortConfig.key === "documentName"
                            ? reviewedDocumentsSortConfig.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className="border-b border-[#dedad9] px-4 py-3 text-left text-sm font-medium uppercase leading-5 text-[#574E4D]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>Document Name</span>
                          <ReviewedDocumentsSortButton
                            columnKey="documentName"
                            label="Document Name"
                            sortConfig={reviewedDocumentsSortConfig}
                            onSort={handleReviewedDocumentsSort}
                          />
                        </span>
                      </TableHead>
                      <TableHead
                        aria-sort={
                          reviewedDocumentsSortConfig.key ===
                          "transactionEvidence"
                            ? reviewedDocumentsSortConfig.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className="border-b border-[#dedad9] px-4 py-3 text-left text-sm font-medium uppercase leading-5 text-[#574E4D]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>Transaction Evidence</span>
                          <ReviewedDocumentsSortButton
                            columnKey="transactionEvidence"
                            label="Transaction Evidence"
                            sortConfig={reviewedDocumentsSortConfig}
                            onSort={handleReviewedDocumentsSort}
                          />
                        </span>
                      </TableHead>
                      <TableHead
                        aria-sort={
                          reviewedDocumentsSortConfig.key === "submittedBy"
                            ? reviewedDocumentsSortConfig.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className="border-b border-[#dedad9] px-4 py-3 text-left text-sm font-medium uppercase leading-5 text-[#574E4D]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>Submitted By</span>
                          <ReviewedDocumentsSortButton
                            columnKey="submittedBy"
                            label="Submitted By"
                            sortConfig={reviewedDocumentsSortConfig}
                            onSort={handleReviewedDocumentsSort}
                          />
                        </span>
                      </TableHead>
                      <TableHead
                        aria-sort={
                          reviewedDocumentsSortConfig.key === "size"
                            ? reviewedDocumentsSortConfig.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className="border-b border-[#dedad9] px-4 py-3 text-left text-sm font-medium uppercase leading-5 text-[#574E4D]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>Size</span>
                          <ReviewedDocumentsSortButton
                            columnKey="size"
                            label="Size"
                            sortConfig={reviewedDocumentsSortConfig}
                            onSort={handleReviewedDocumentsSort}
                          />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedReviewedDocuments.length ? (
                      sortedReviewedDocuments.map((document) => (
                        <TableRow
                          key={document.aiResponseDocumentId}
                          className="last:[&>td]:border-b-0 hover:bg-transparent"
                          data-qaautomationid={`case-review-reviewed-document-row-${document.aiResponseDocumentId}`}
                        >
                          <TableCell className="border-b border-[#ece7e5] px-4 py-3 text-sm font-normal leading-5 text-ellipsis underline text-[#01579B]">
                            <button
                              type="button"
                              className="text-left underline"
                              data-qaautomationid={`case-review-reviewed-document-button-${document.aiResponseDocumentId}`}
                              onClick={() => {
                                handleOpenDocumentContent(document.documentId);
                              }}
                            >
                              {document.documentName}
                            </button>
                          </TableCell>
                          <TableCell
                            className="border-b border-[#ece7e5] px-4 py-3 text-sm leading-5 text-[#4a4442]"
                            data-qaautomationid={`case-review-reviewed-document-transaction-evidence-${document.aiResponseDocumentId}`}
                          >
                            {document.isTransactionEvidenceDocument
                              ? "Yes"
                              : "No"}
                          </TableCell>
                          <TableCell className="border-b border-[#ece7e5] px-4 py-3 text-sm leading-5 text-[#4a4442]">
                            {document.submittedBy ?? "—"}
                          </TableCell>
                          <TableCell className="border-b border-[#ece7e5] px-4 py-3 text-sm leading-5 text-[#4a4442]">
                            {formatFileSize(document.fileSize)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow className="hover:bg-white">
                        <TableCell
                          className="px-4 py-8 text-center text-sm text-[#6c717e]"
                          colSpan={4}
                        >
                          No reviewed documents available.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
