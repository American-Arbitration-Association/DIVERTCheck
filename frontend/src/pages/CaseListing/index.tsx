//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import * as XLSX from "@e965/xlsx";
import {
  IconArrowDown,
  IconArrowUp,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconFileExport,
  IconFileText,
  IconFilter,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import SelectDropdown from "@/components/common/SelectDropdown";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { toTestIdSegment } from "@/lib/utils";
import {
  getReviewQueue,
  type ReviewQueueDocumentItem,
  type ReviewQueueItem,
} from "@/services";
import {
  buildCitationPreviewUrl,
  buildDocumentPreviewUrl,
} from "@/services/documentPreview";

type ReviewStatus = "Analyzing" | "Complete" | "Error";
type StatusFilter = "All" | ReviewStatus;
type ColumnKey =
  | "caseName"
  | "caseNumber"
  | "filingDate"
  | "reviewDate"
  | "status"
  | "summary"
  | "documentName";
type SortDirection = "asc" | "desc";
interface SortConfig {
  key: ColumnKey;
  direction: SortDirection;
}

const PAGE_SIZE = 10;
const REVIEW_QUEUE_QUERY_KEY = ["review-queue"] as const;
const REVIEW_QUERY_CACHE_TIME = Infinity;

const defaultVisibleColumns: Record<ColumnKey, boolean> = {
  caseName: true,
  caseNumber: true,
  filingDate: true,
  reviewDate: true,
  status: true,
  summary: true,
  documentName: true,
};

const columnOrder: ColumnKey[] = [
  "caseName",
  "caseNumber",
  "filingDate",
  "reviewDate",
  "status",
  "summary",
  "documentName",
];

const columnLabels: Record<ColumnKey, string> = {
  caseName: "Case Name",
  caseNumber: "Case Number",
  filingDate: "Filing Date",
  reviewDate: "Review Date",
  status: "Status",
  summary: "Summary",
  documentName: "Document Name",
};

const statusOptions: StatusFilter[] = ["All", "Analyzing", "Complete", "Error"];
const statusSortOrder: Record<ReviewStatus, number> = {
  Analyzing: 0,
  Complete: 1,
  Error: 2,
};

function formatDate(dateValue: string) {
  if (!dateValue || dateValue === "null") {
    return "null";
  }

  const [year, month, day] = dateValue.split("-");

  if (!year || !month || !day) {
    return "null";
  }

  return `${month}/${day}/${year}`;
}

function formatDateForFilter(dateValue?: Date) {
  if (!dateValue) {
    return "";
  }

  return format(dateValue, "yyyy-MM-dd");
}

function formatDateRangeLabel(dateRange: DateRange | undefined) {
  if (dateRange?.from) {
    if (dateRange.to) {
      return `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`;
    }

    return format(dateRange.from, "LLL dd, y");
  }

  return "Pick a date range";
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const statusClasses: Record<ReviewStatus, string> = {
    Analyzing: "text-brand-red",
    Complete: "text-status-success-strong",
    Error: "text-brand-red",
  };

  const statusLabels: Record<ReviewStatus, string> = {
    Analyzing: "Analyzing...",
    Complete: "Complete",
    Error: "Error",
  };

  return (
    <div
      className={`inline-flex items-center font-medium ${statusClasses[status]}`}
      data-qaautomationid={`review-queue-status-${toTestIdSegment(status)}`}
    >
      {statusLabels[status]}
    </div>
  );
}

function getDocumentNames(documents: ReviewQueueDocumentItem[]) {
  return documents
    .map((document) => document.documentName.trim())
    .filter(Boolean);
}

function buildDocumentPreview(documentNames: string[]) {
  return documentNames[0] ?? "";
}

function getSortDefaultDirection(): SortDirection {
  return "asc";
}

function getReviewCaseSortValue(
  reviewCase: ReviewQueueItem,
  columnKey: ColumnKey,
) {
  switch (columnKey) {
    case "caseName":
      return reviewCase.caseName;
    case "caseNumber":
      return reviewCase.caseNumber;
    case "filingDate":
      return reviewCase.filingDate;
    case "reviewDate":
      return reviewCase.reviewDate;
    case "status":
      return reviewCase.status;
    case "summary":
      return reviewCase.summary;
    case "documentName":
      return getDocumentNames(reviewCase.documents).join(", ");
  }
}

function compareReviewCases(
  leftCase: ReviewQueueItem,
  rightCase: ReviewQueueItem,
  sortConfig: SortConfig,
) {
  const leftValue = getReviewCaseSortValue(leftCase, sortConfig.key);
  const rightValue = getReviewCaseSortValue(rightCase, sortConfig.key);

  let comparison = 0;

  if (sortConfig.key === "status") {
    comparison =
      statusSortOrder[leftCase.status] - statusSortOrder[rightCase.status];
  } else {
    comparison = leftValue.localeCompare(rightValue, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  if (comparison === 0) {
    comparison = leftCase.aiResponseId - rightCase.aiResponseId;
  }

  return sortConfig.direction === "asc" ? comparison : -comparison;
}

function getSortIcon(sortConfig: SortConfig, columnKey: ColumnKey) {
  if (sortConfig.key !== columnKey) {
    return <IconArrowUp size={13} className="shrink-0 text-[#c6bfbd]" />;
  }

  return sortConfig.direction === "asc" ? (
    <IconArrowUp size={13} className="shrink-0 text-[#272423]" />
  ) : (
    <IconArrowDown size={13} className="shrink-0 text-[#272423]" />
  );
}

function SortButton({
  columnKey,
  label,
  sortConfig,
  onSort,
}: {
  columnKey: ColumnKey;
  label: string;
  sortConfig: SortConfig;
  onSort: (columnKey: ColumnKey) => void;
}) {
  const isActive = sortConfig.key === columnKey;
  const sortLabel = isActive
    ? sortConfig.direction === "asc"
      ? "sorted ascending"
      : "sorted descending"
    : "sort";

  return (
    <div className="inline-flex items-center gap-2 whitespace-nowrap">
      <span>{label}</span>
      <button
        aria-label={`${label} ${sortLabel}`}
        className="inline-flex size-4 shrink-0 items-center justify-center p-0 text-[#272423] transition-colors hover:text-[#111827]"
        type="button"
        data-qaautomationid={`review-queue-sort-button-${toTestIdSegment(label)}`}
        onClick={() => onSort(columnKey)}
      >
        {getSortIcon(sortConfig, columnKey)}
      </button>
    </div>
  );
}

function toExportText(value: unknown) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function DocumentCell({ reviewCase }: { reviewCase: ReviewQueueItem }) {
  const documentNames = getDocumentNames(reviewCase.documents);
  const primaryDocumentName = documentNames[0] ?? reviewCase.documentName;
  const documentPreview = buildDocumentPreview(documentNames);
  const additionalDocumentCount = Math.max(documentNames.length - 1, 0);
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);

  const getDocumentHref = (document: ReviewQueueDocumentItem | undefined) => {
    if (!document?.documentId) {
      return "";
    }

    return buildDocumentPreviewUrl(reviewCase.caseId, document.documentId);
  };

  if (!primaryDocumentName) {
    return <span className="text-foreground-tertiary">No documents</span>;
  }

  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-qaautomationid={`review-queue-document-cell-${toTestIdSegment(primaryDocumentName)}`}
    >
      <a
        href={getDocumentHref(reviewCase.documents[0]) || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-[#01579b] hover:underline"
        title={documentPreview}
        data-qaautomationid={`review-queue-document-link-${toTestIdSegment(primaryDocumentName)}`}
      >
        {documentPreview}
      </a>

      {additionalDocumentCount > 0 && (
        <Popover open={isDocumentsOpen} onOpenChange={setIsDocumentsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground-secondary transition-colors hover:text-[#01579b]"
              data-qaautomationid={`review-queue-document-more-button-${toTestIdSegment(primaryDocumentName)}`}
            >
              +{additionalDocumentCount} more
              <IconChevronDown
                size={14}
                className={`transition-transform ${
                  isDocumentsOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="z-[9999] isolate w-[315px] max-w-[315px] overflow-hidden rounded-[8px] border border-[#C1BAB8] bg-white p-0 opacity-100 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]"
            style={{
              zIndex: 2147483647,
              backgroundColor: "#ffffff",
              opacity: 1,
            }}
          >
            <div className="absolute inset-0 bg-white" aria-hidden="true" />
            <div className="relative z-10 bg-white">
              <div className="border-b border-[#ece7e5] bg-white px-4 py-3">
                <p className="text-[14px] leading-5 font-semibold text-foreground-primary">
                  Documents ({documentNames.length})
                </p>
              </div>
              <div className="max-h-[260px] overflow-y-auto bg-white py-1">
                {documentNames.map((documentName, index) => (
                  <a
                    key={`${reviewCase.id}-${documentName}-${index}`}
                    href={
                      getDocumentHref(reviewCase.documents[index]) || undefined
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative z-10 flex items-center gap-3 border-b border-[#ece7e5] bg-white px-4 py-1 text-[14px] leading-5 text-[#01579b] last:border-b-0 hover:bg-[#f7f4f3] hover:underline"
                    title={documentName}
                    data-qaautomationid={`review-queue-document-option-${toTestIdSegment(documentName)}`}
                  >
                    <IconFileText
                      size={16}
                      className="shrink-0 text-[#ff2f1f]"
                    />
                    <span className="min-w-0 flex-1 line-clamp-2 break-words">
                      {documentName}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function SummaryCell({
  reviewCase,
  maxLines = 2,
}: {
  reviewCase: ReviewQueueItem;
  maxLines?: number;
}) {
  return (
    <div
      className="w-full overflow-hidden break-words [overflow-wrap:anywhere] [&_a]:text-[#01579b] [&_a]:underline [&_a]:underline-offset-[0.15em] [&_em]:italic [&_p]:m-0 [&_strong]:font-semibold"
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: maxLines,
      }}
    >
      <ReactMarkdown
        components={{
          a: ({ children, href, title }) => (
            <a
              href={buildCitationPreviewUrl(href, reviewCase.caseId)}
              title={title}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
      >
        {reviewCase.summary}
      </ReactMarkdown>
    </div>
  );
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 3) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 2) {
    return [1, 2, 3, "ellipsis-right"];
  }

  if (currentPage >= totalPages - 1) {
    return ["ellipsis-left", totalPages - 2, totalPages - 1, totalPages];
  }

  return [currentPage - 1, currentPage, currentPage + 1, "ellipsis-right"];
}

export default function CaseListing() {
  const [queryInput, setQueryInput] = useState("");
  const [statusInput, setStatusInput] = useState<StatusFilter>("All");
  const [dateRangeInput, setDateRangeInput] = useState<DateRange | undefined>();
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "reviewDate",
    direction: "desc",
  });
  const [filters, setFilters] = useState({
    query: "",
    status: "All" as StatusFilter,
    startDate: "",
    endDate: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isViewSettingsOpen, setIsViewSettingsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns);
  const [draftVisibleColumns, setDraftVisibleColumns] = useState(
    defaultVisibleColumns,
  );
  const [selectedAvailableColumn, setSelectedAvailableColumn] =
    useState<ColumnKey | null>(null);
  const [selectedVisibleColumn, setSelectedVisibleColumn] =
    useState<ColumnKey | null>(null);
  const {
    data: reviewQueue = [],
    isLoading: isLoadingReviewQueue,
    error: reviewQueueError,
  } = useQuery({
    queryKey: REVIEW_QUEUE_QUERY_KEY,
    queryFn: getReviewQueue,
    staleTime: REVIEW_QUERY_CACHE_TIME,
    gcTime: REVIEW_QUERY_CACHE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) =>
      query.state.data?.some((reviewCase) => reviewCase.status === "Analyzing")
        ? 10_000
        : false,
  });

  const filteredCases = reviewQueue.filter((reviewCase) => {
    const normalizedQuery = filters.query.trim().toLowerCase();
    const searchableContent = [
      reviewCase.caseName,
      reviewCase.caseNumber,
      reviewCase.status,
      reviewCase.summary,
      reviewCase.documentName,
      ...getDocumentNames(reviewCase.documents),
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery =
      normalizedQuery.length === 0 ||
      searchableContent.includes(normalizedQuery);
    const matchesStatus =
      filters.status === "All" || reviewCase.status === filters.status;
    const matchesStartDate =
      filters.startDate.length === 0 ||
      reviewCase.filingDate >= filters.startDate;
    const matchesEndDate =
      filters.endDate.length === 0 || reviewCase.filingDate <= filters.endDate;

    return matchesQuery && matchesStatus && matchesStartDate && matchesEndDate;
  });
  const sortedCases = [...filteredCases].sort((leftCase, rightCase) =>
    compareReviewCases(leftCase, rightCase, sortConfig),
  );

  const totalPages = Math.max(1, Math.ceil(sortedCases.length / PAGE_SIZE));
  const currentPageForRender = Math.min(currentPage, totalPages);
  const pageStartIndex = (currentPageForRender - 1) * PAGE_SIZE;
  const visibleRows = sortedCases.slice(
    pageStartIndex,
    pageStartIndex + PAGE_SIZE,
  );
  // const visibleStartCount = filteredCases.length === 0 ? 0 : pageStartIndex + 1;
  // const visibleEndCount = Math.min(
  //   currentPageForRender * PAGE_SIZE,
  //   filteredCases.length,
  // );
  const paginationItems = buildPaginationItems(
    currentPageForRender,
    totalPages,
  );
  const availableColumns = columnOrder.filter(
    (columnKey) => !draftVisibleColumns[columnKey],
  );
  const selectedColumns = columnOrder.filter(
    (columnKey) => draftVisibleColumns[columnKey],
  );
  const visibleColumnCount = columnOrder.filter(
    (columnKey) => visibleColumns[columnKey],
  ).length;
  const hasReviewQueueData = reviewQueue.length > 0;

  const applyFilters = () => {
    setFilters({
      query: queryInput,
      status: statusInput,
      startDate: formatDateForFilter(dateRangeInput?.from),
      endDate: formatDateForFilter(dateRangeInput?.to),
    });
    setIsDateRangeOpen(false);
    setCurrentPage(1);
  };

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (hasReviewQueueData) {
      applyFilters();
    }
  };

  const clearFilters = () => {
    setQueryInput("");
    setStatusInput("All");
    setDateRangeInput(undefined);
    setFilters({
      query: "",
      status: "All",
      startDate: "",
      endDate: "",
    });
    setIsDateRangeOpen(false);
    setCurrentPage(1);
  };

  const handleSort = (columnKey: ColumnKey) => {
    setSortConfig((currentSort) => ({
      key: columnKey,
      direction:
        currentSort.key === columnKey
          ? currentSort.direction === "asc"
            ? "desc"
            : "asc"
          : getSortDefaultDirection(),
    }));
    setCurrentPage(1);
  };

  const exportResults = () => {
    if (filteredCases.length === 0) {
      return;
    }

    const exportColumns = columnOrder.filter(
      (columnKey) => visibleColumns[columnKey],
    );
    const exportValueByColumn: Record<
      ColumnKey,
      (reviewCase: ReviewQueueItem) => string
    > = {
      caseName: (reviewCase) => reviewCase.caseName,
      caseNumber: (reviewCase) => reviewCase.caseNumber,
      filingDate: (reviewCase) => formatDate(reviewCase.filingDate),
      reviewDate: (reviewCase) => formatDate(reviewCase.reviewDate),
      status: (reviewCase) => reviewCase.status,
      summary: (reviewCase) => reviewCase.summary,
      documentName: (reviewCase) =>
        getDocumentNames(reviewCase.documents).join(", "),
    };

    const worksheetData = [
      exportColumns.map((columnKey) => columnLabels[columnKey]),
      ...sortedCases.map((reviewCase) =>
        exportColumns.map((columnKey) =>
          toExportText(exportValueByColumn[columnKey](reviewCase)),
        ),
      ),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    const columnWidths = exportColumns.map((columnKey, index) => {
      const values = sortedCases.map((reviewCase) =>
        toExportText(exportValueByColumn[columnKey](reviewCase)),
      );
      const maxLength = Math.max(
        columnLabels[columnKey].length,
        ...values.map((value) => value.length),
        12,
      );
      return { wch: Math.min(maxLength + (index === 0 ? 4 : 2), 48) };
    });

    worksheet["!cols"] = columnWidths;
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: {
          r: worksheetData.length - 1,
          c: exportColumns.length - 1,
        },
      }),
    };

    XLSX.utils.book_append_sheet(workbook, worksheet, "Review Queue");
    XLSX.writeFile(workbook, "review-queue-export.xlsx");
  };

  const handleViewSettingsOpenChange = (open: boolean) => {
    setIsViewSettingsOpen(open);

    if (open) {
      setDraftVisibleColumns(visibleColumns);
      setSelectedAvailableColumn(null);
      setSelectedVisibleColumn(null);
    }
  };

  const moveColumnToSelected = () => {
    if (!selectedAvailableColumn) {
      return;
    }

    setDraftVisibleColumns((currentColumns) => ({
      ...currentColumns,
      [selectedAvailableColumn]: true,
    }));
    setSelectedVisibleColumn(selectedAvailableColumn);
    setSelectedAvailableColumn(null);
  };

  const moveColumnToAvailable = () => {
    if (!selectedVisibleColumn) {
      return;
    }

    setDraftVisibleColumns((currentColumns) => ({
      ...currentColumns,
      [selectedVisibleColumn]: false,
    }));
    setSelectedAvailableColumn(selectedVisibleColumn);
    setSelectedVisibleColumn(null);
  };

  const resetViewSettings = () => {
    setDraftVisibleColumns(defaultVisibleColumns);
    setSelectedAvailableColumn(null);
    setSelectedVisibleColumn(null);
  };

  const applyViewSettings = () => {
    setVisibleColumns(draftVisibleColumns);
    setIsViewSettingsOpen(false);
  };

  return (
    <div
      className="relative overflow-hidden px-[64px] pt-3"
      data-qaautomationid="review-queue-page"
    >
      <div className="relative">
        <h2
          className="m-0 !text-[32px] leading-[38.4px] font-medium text-[#111827]"
          data-qaautomationid="review-queue-title"
        >
          Review Results
        </h2>

        <form
          className="mt-5 grid grid-cols-[minmax(0,1.45fr)_minmax(0,1.05fr)_minmax(180px,0.72fr)_164px_92px] items-end gap-x-4"
          onSubmit={handleFilterSubmit}
        >
          <div className="grid min-w-0 gap-2">
            <label
              className="text-sm font-medium tracking-[0.12em] text-foreground-primary"
              htmlFor="case-search"
              data-qaautomationid="review-queue-search-label"
            >
              Quick Search
            </label>
            <div className="flex h-11 items-center gap-2 self-stretch rounded-[12px] border border-[#c9c2bf] bg-white px-3 transition hover:border-[#a89f9d] focus-within:border-[#01579b] focus-within:shadow-[0_0_0_1px_rgba(1,87,155,0.12)]">
              <IconSearch size={16} className="text-foreground-muted" />
              <input
                id="case-search"
                autoFocus
                className="w-full !border-none bg-transparent p-0 text-sm leading-5 text-[#272423] outline-none placeholder:text-placeholder"
                placeholder="Search with case name, number, status, etc."
                type="text"
                maxLength={100}
                value={queryInput}
                data-qaautomationid="review-queue-search-input"
                onChange={(event) => setQueryInput(event.target.value)}
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <label
              className="text-sm font-medium tracking-[0.12em] text-foreground-primary"
              htmlFor="filing-date-range"
              data-qaautomationid="review-queue-date-range-label"
            >
              Filing Date Range
            </label>
            <Popover open={isDateRangeOpen} onOpenChange={setIsDateRangeOpen}>
              <PopoverTrigger asChild>
                <button
                  id="filing-date-range"
                  className="flex h-11 w-full items-center justify-start gap-2 rounded-[12px] !border !border-input bg-white px-3 text-left font-normal"
                  type="button"
                  data-qaautomationid="review-queue-date-range-button"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !isDateRangeOpen) {
                      event.preventDefault();
                      applyFilters();
                    }
                  }}
                >
                  <IconCalendarEvent
                    size={16}
                    className="shrink-0 text-foreground-muted"
                  />
                  <span className="truncate text-sm text-placeholder">
                    {formatDateRangeLabel(dateRangeInput)}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="case-range-popover w-auto p-0"
                align="start"
                data-qaautomationid="review-queue-date-range-popover"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    dateRangeInput?.from &&
                    dateRangeInput.to
                  ) {
                    event.preventDefault();
                    applyFilters();
                  }
                }}
              >
                <Calendar
                  className="case-range-picker"
                  mode="range"
                  defaultMonth={dateRangeInput?.from}
                  selected={dateRangeInput}
                  data-qaautomationid="review-queue-date-range-calendar"
                  onSelect={setDateRangeInput}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid min-w-0 gap-2">
            <label
              className="text-sm font-medium tracking-[0.12em] text-foreground-primary"
              htmlFor="status-filter"
            >
              Status
            </label>
            <SelectDropdown
              id="status-filter"
              value={statusInput}
              testId="review-queue-status-filter"
              onChange={(value) => setStatusInput(value as StatusFilter)}
              onEnter={applyFilters}
              options={statusOptions.map((statusOption) => ({
                label: statusOption,
                value: statusOption,
              }))}
            />
          </div>

          <div className="grid self-end gap-2">
            <div className="h-4" />
            <button
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#01579B] px-4 py-2"
              disabled={!hasReviewQueueData}
              type="submit"
              data-qaautomationid="review-queue-apply-filters-button"
            >
              <IconFilter size={16} className="text-[#F7F6F5]" />
              <span className="text-sm font-medium leading-5 text-[#F7F6F5]">
                Apply Filters
              </span>
            </button>
          </div>

          <div className="grid self-end gap-2">
            <div className="h-4" />
            <button
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#F0EFEE] px-4 py-2"
              type="button"
              data-qaautomationid="review-queue-clear-filters-button"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="absolute top-0 right-0">
          <div className="relative justify-self-end">
            <div className="flex items-center gap-3">
              <Dialog
                open={isViewSettingsOpen}
                onOpenChange={handleViewSettingsOpenChange}
              >
                <button
                  className="flex h-10 items-center justify-center gap-2 rounded-md !border !border-[#9E9492] px-4 py-2"
                  type="button"
                  data-qaautomationid="review-queue-view-settings-button"
                  onClick={() => handleViewSettingsOpenChange(true)}
                >
                  View Settings
                </button>
                <DialogContent
                  className="flex max-h-[calc(100vh-32px)] w-[800px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-[8px] border border-[#dedad9] bg-white p-0 shadow-[0_28px_70px_rgba(39,36,35,0.22)] gap-0"
                  hideCloseIcon
                  data-qaautomationid="review-queue-view-settings-dialog"
                >
                  <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#d8d2d0] px-6 py-3">
                    <p className="font-suisse text-base font-medium leading-4 text-[#272423]">
                      View Settings
                    </p>
                    <button
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-[#8c8482]"
                      type="button"
                      data-qaautomationid="review-queue-view-settings-close-button"
                      onClick={() => setIsViewSettingsOpen(false)}
                    >
                      <IconX size={20} stroke={1.8} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
                    <p className="m-0 text-base leading-4 font-medium text-[#272423]">
                      Custom columns
                    </p>
                    <p className="mat-1 font-suisse text-sm font-normal leading-3 text-[#272423]">
                      Select which columns you want visible in your document
                      list below. Use the arrows to move items between available
                      and selected columns.
                    </p>
                    <div className="mt-3 grid grid-cols-[1fr_56px_1fr] items-start gap-[20px]">
                      <div className="grid min-w-0 gap-[0.55rem]">
                        <p className="font-suisse text-xs font-normal leading-[18px] text-[#272423]">
                          Available Columns
                        </p>
                        <div className="h-[200px] rounded-[6px] border border-[#c9c2bf] bg-white p-[0.2rem]">
                          {availableColumns.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-[0.9rem] text-[#9e9492]">
                              No hidden columns
                            </div>
                          ) : (
                            <div className="grid max-h-full gap-[0.1rem] overflow-y-auto">
                              {availableColumns.map((columnKey) => (
                                <button
                                  key={columnKey}
                                  className={`flex min-h-[2.3rem] items-center rounded-[6px] px-2 text-left font-suisse text-sm font-normal leading-[14px] ${
                                    selectedAvailableColumn === columnKey
                                      ? "bg-[#edf3fb] text-[#01579b]"
                                      : "bg-transparent text-foreground-primary"
                                  }`}
                                  type="button"
                                  data-qaautomationid={`review-queue-available-column-${toTestIdSegment(columnLabels[columnKey])}`}
                                  onClick={() => {
                                    setSelectedAvailableColumn(columnKey);
                                    setSelectedVisibleColumn(null);
                                  }}
                                >
                                  {columnLabels[columnKey]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex h-[200px] flex-col items-center justify-center gap-3">
                        <button
                          className="confirm h-[2.3rem] min-w-[2.3rem] rounded-[8px] "
                          disabled={!selectedAvailableColumn}
                          type="button"
                          data-qaautomationid="review-queue-move-column-right-button"
                          onClick={moveColumnToSelected}
                        >
                          <IconChevronRight size={18} />
                        </button>
                        <button
                          className="white h-[2.3rem] min-w-[2.3rem] rounded-[8px]"
                          disabled={!selectedVisibleColumn}
                          type="button"
                          data-qaautomationid="review-queue-move-column-left-button"
                          onClick={moveColumnToAvailable}
                        >
                          <IconChevronLeft size={18} />
                        </button>
                      </div>

                      <div className="grid min-w-0 gap-[0.55rem]">
                        <p className="font-suisse text-xs font-normal leading-[18px] text-[#272423]">
                          Selected Columns
                        </p>
                        <div className="h-[200px] rounded-[6px] border border-[#c9c2bf] bg-white p-[0.2rem]">
                          <div className="grid max-h-full gap-[0.1rem] overflow-y-auto">
                            {selectedColumns.map((columnKey) => (
                              <button
                                key={columnKey}
                                className={`flex min-h-[2.3rem] items-center rounded-[6px] px-2 text-left font-suisse text-sm font-normal leading-[14px] ${
                                  selectedVisibleColumn === columnKey
                                    ? "bg-[#edf3fb] text-[#01579b]"
                                    : "bg-transparent text-foreground-primary"
                                }`}
                                type="button"
                                data-qaautomationid={`review-queue-selected-column-${toTestIdSegment(columnLabels[columnKey])}`}
                                onClick={() => {
                                  setSelectedVisibleColumn(columnKey);
                                  setSelectedAvailableColumn(null);
                                }}
                              >
                                {columnLabels[columnKey]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#d8d2d0] bg-[#faf8f8] px-6 py-3">
                    <button
                      className="flex h-[2.35rem] items-center justify-center rounded-[10px] border border-[#d8d2d0] bg-secondary px-4 text-foreground-secondary"
                      type="button"
                      data-qaautomationid="review-queue-reset-view-settings-button"
                      onClick={resetViewSettings}
                    >
                      Reset to Default
                    </button>
                    <button
                      className="confirm flex h-[2.35rem] items-center justify-center rounded-[10px] px-6"
                      type="button"
                      data-qaautomationid="review-queue-apply-view-settings-button"
                      onClick={applyViewSettings}
                    >
                      Apply Changes
                    </button>
                  </div>
                </DialogContent>
              </Dialog>
              <button
                className="confirm flex h-11 min-w-[104px] items-center justify-center gap-2 rounded-[12px] px-4"
                disabled={filteredCases.length === 0}
                type="button"
                data-qaautomationid="review-queue-export-button"
                onClick={exportResults}
              >
                Export
                <IconFileExport size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-[20px] border border-border bg-white">
          <Table className="w-full table-fixed border-collapse">
            <TableHeader>
              <TableRow className="border-b border-border bg-transparent hover:bg-transparent">
                {visibleColumns.caseName && (
                  <TableHead
                    aria-sort={
                      sortConfig.key === "caseName"
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-[13%] px-4 py-3 text-sm font-medium uppercase text-[#574E4D]"
                  >
                    <SortButton
                      columnKey="caseName"
                      label="Case Name"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {visibleColumns.caseNumber && (
                  <TableHead
                    aria-sort={
                      sortConfig.key === "caseNumber"
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-[10%] px-4 py-3 text-sm font-medium uppercase text-[#574E4D]"
                  >
                    <SortButton
                      columnKey="caseNumber"
                      label="Case Number"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {visibleColumns.filingDate && (
                  <TableHead
                    aria-sort={
                      sortConfig.key === "filingDate"
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-[10%] px-4 py-3 text-sm font-medium uppercase text-[#574E4D]"
                  >
                    <SortButton
                      columnKey="filingDate"
                      label="Filing Date"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {visibleColumns.reviewDate && (
                  <TableHead
                    aria-sort={
                      sortConfig.key === "reviewDate"
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-[10%] px-4 py-3 text-sm font-medium uppercase text-[#574E4D]"
                  >
                    <SortButton
                      columnKey="reviewDate"
                      label="Review Date"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {visibleColumns.status && (
                  <TableHead
                    aria-sort={
                      sortConfig.key === "status"
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-[8%] px-4 py-3 text-sm font-medium uppercase text-[#574E4D]"
                  >
                    <SortButton
                      columnKey="status"
                      label="Status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {visibleColumns.summary && (
                  <TableHead
                    aria-sort={
                      sortConfig.key === "summary"
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-[16%] px-4 py-3 text-sm font-medium uppercase text-[#574E4D]"
                  >
                    <SortButton
                      columnKey="summary"
                      label="Summary"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {visibleColumns.documentName && (
                  <TableHead
                    aria-sort={
                      sortConfig.key === "documentName"
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="w-[16%] px-4 py-3 text-sm font-medium uppercase text-[#574E4D]"
                  >
                    <SortButton
                      columnKey="documentName"
                      label="Document Name"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {visibleRows.map((reviewCase) => (
                <TableRow
                  key={reviewCase.id}
                  className="align-top hover:bg-transparent last:[&>td]:border-b-0"
                  data-qaautomationid={`review-queue-row-${reviewCase.aiResponseId}`}
                >
                  {visibleColumns.caseName && (
                    <TableCell className="w-[13%] border-b border-[#ece7e5] px-4 py-3 align-middle text-left text-sm leading-5 font-medium text-[#01579b]">
                      <div className="line-clamp-2 w-full overflow-hidden break-words [overflow-wrap:anywhere]">
                        <Link
                          to={`/cases/${reviewCase.caseId}`}
                          state={{ reviewCase }}
                          className="hover:underline"
                          data-qaautomationid={`review-queue-case-link-${reviewCase.aiResponseId}`}
                        >
                          {reviewCase.caseName}
                        </Link>
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.caseNumber && (
                    <TableCell
                      className="w-[10%] border-b border-[#ece7e5] px-4 py-3 align-middle text-left text-sm leading-5 text-foreground-secondary"
                      data-qaautomationid={`review-queue-case-number-cell-${reviewCase.aiResponseId}`}
                    >
                      <div className="line-clamp-2 w-full overflow-hidden break-words [overflow-wrap:anywhere]">
                        {reviewCase.caseNumber}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.filingDate && (
                    <TableCell
                      className="w-[10%] border-b border-[#ece7e5] px-4 py-3 align-middle text-left text-sm leading-5 text-foreground-secondary"
                      data-qaautomationid={`review-queue-filing-date-cell-${reviewCase.aiResponseId}`}
                    >
                      {formatDate(reviewCase.filingDate)}
                    </TableCell>
                  )}
                  {visibleColumns.reviewDate && (
                    <TableCell
                      className="w-[10%] border-b border-[#ece7e5] px-4 py-3 align-middle text-left text-sm leading-5 text-foreground-secondary"
                      data-qaautomationid={`review-queue-review-date-cell-${reviewCase.aiResponseId}`}
                    >
                      {formatDate(reviewCase.reviewDate)}
                    </TableCell>
                  )}
                  {visibleColumns.status && (
                    <TableCell
                      className="w-[8%] border-b border-[#ece7e5] px-4 py-3 align-middle text-left text-sm leading-5"
                      data-qaautomationid={`review-queue-status-cell-${reviewCase.aiResponseId}`}
                    >
                      <StatusBadge status={reviewCase.status} />
                    </TableCell>
                  )}
                  {visibleColumns.summary && (
                    <TableCell
                      className="w-[16%] border-b border-[#ece7e5] px-4 py-3 align-middle text-left text-sm leading-5 text-foreground-secondary"
                      data-qaautomationid={`review-queue-summary-cell-${reviewCase.aiResponseId}`}
                    >
                      <SummaryCell reviewCase={reviewCase} maxLines={4} />
                    </TableCell>
                  )}
                  {visibleColumns.documentName && (
                    <TableCell
                      className="w-[16%] border-b border-[#ece7e5] px-4 py-3 align-middle text-left text-sm leading-5 text-[#01579b]"
                      data-qaautomationid={`review-queue-document-name-cell-${reviewCase.aiResponseId}`}
                    >
                      <DocumentCell reviewCase={reviewCase} />
                    </TableCell>
                  )}
                </TableRow>
              ))}

              {visibleRows.length === 0 && (
                <TableRow className="hover:bg-white">
                  <TableCell
                    className="px-5 py-10 text-center text-sm text-foreground-tertiary"
                    colSpan={visibleColumnCount}
                  >
                    {isLoadingReviewQueue
                      ? "Loading review queue..."
                      : reviewQueueError instanceof Error
                        ? reviewQueueError.message
                        : "No reviews match the current filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 mb-6 flex justify-end pt-3">
          <div className="flex min-w-[270px] items-center justify-end gap-1.5 text-sm text-foreground-secondary">
            <button
              className="flex h-9 items-center gap-1 rounded-[8px] bg-transparent px-2 py-0 text-foreground-primary disabled:cursor-not-allowed disabled:text-foreground-muted"
              disabled={currentPageForRender === 1}
              type="button"
              data-qaautomationid="review-queue-pagination-previous"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              <IconChevronLeft size={16} />
              Previous
            </button>

            {paginationItems.map((pageItem) =>
              typeof pageItem === "number" ? (
                <button
                  key={pageItem}
                  className={
                    pageItem === currentPageForRender
                      ? "flex h-9 min-w-[38px] items-center justify-center rounded-[8px] border border-[#d8d2d0] bg-[#f7f4f3] px-3 py-0 text-foreground-primary"
                      : "flex h-9 min-w-[38px] items-center justify-center rounded-[8px] bg-transparent px-3 py-0 text-foreground-primary"
                  }
                  type="button"
                  data-qaautomationid={`review-queue-pagination-page-${pageItem}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setCurrentPage(pageItem)}
                >
                  {pageItem}
                </button>
              ) : (
                <span
                  key={pageItem}
                  className="flex h-9 min-w-[24px] items-center justify-center px-1 text-foreground-primary"
                >
                  ...
                </span>
              ),
            )}

            <button
              className="flex h-9 items-center gap-1 rounded-[8px] bg-transparent px-2 py-0 text-foreground-primary disabled:cursor-not-allowed disabled:text-foreground-muted"
              disabled={currentPageForRender === totalPages}
              type="button"
              data-qaautomationid="review-queue-pagination-next"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
            >
              Next
              <IconChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
