//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconEye,
  IconHourglass,
  IconInfoCircle,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import FormFieldError from "@/components/common/FormFieldError";
import SelectDropdown from "@/components/common/SelectDropdown";
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
import { useJobRegistry } from "@/context/useJobRegistry";
import { promptConfigurationData } from "@/data/promptConfiguration";
import { toTestIdSegment } from "@/lib/utils";
import {
  cancelGeneratedSuggestedPrompt,
  getCompletedSuggestedPrompt,
  getCurrentPromptConfiguration,
  getPromptConfigurationVersion,
  queueSuggestedPromptJob,
  savePromptConfiguration,
  setCurrentPromptConfigurationVersion,
  type CurrentPromptConfigurationItem,
  type PromptType,
  type SavePromptConfigurationRequest,
} from "@/services";

const promptFieldClassName =
  "h-11 min-h-11 w-full rounded-lg border border-border bg-white px-3 py-0 text-sm text-foreground-primary outline-none transition focus:border-[#1658d3] focus:ring-4 focus:ring-[#1658d3]/10";
type PromptPageBanner = "apply-success" | "save-success" | null;
type ReferenceDocument = {
  file?: File;
  fileName: string;
  fileSize?: number;
} | null;
const PROMPT_CONFIGURATION_QUERY_KEY = [
  "prompt-configuration",
  "current",
] as const;
const PROMPT_CONFIGURATION_VERSION_QUERY_KEY = [
  "prompt-configuration",
  "version",
] as const;
const PROMPT_CONFIGURATION_QUERY_CACHE_TIME = Infinity;
const MAX_REFERENCE_DOCUMENT_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const PROMPT_GENERATION_ERROR_MESSAGES: Record<PromptType, string> = {
  main: "We couldn't generate the prompt preview. Please try again.",
  summary: "We couldn't generate the summary prompt. Please try again.",
};
const PROMPT_GENERATION_CANCELED_MESSAGES: Record<PromptType, string> = {
  main: "Prompt preview is canceled. You can try again immediately.",
  summary: "Summary prompt is canceled. You can try again immediately.",
};
const ACTIVE_PROMPT_JOB_STATUSES = new Set([
  "QUEUED",
  "PENDING",
  "SCHEDULED",
  "IN_PROGRESS",
  "PROCESSING",
  "RUNNING",
  "RETRY",
  "RETRYING",
]);
const FAILED_PROMPT_JOB_STATUSES = new Set(["FAILED"]);
const CANCELED_PROMPT_JOB_STATUSES = new Set(["CANCELED", "CANCELLED"]);
const promptPreviewScopeClassName = [
  "prompt-preview-scope",
  "px-8",
  "py-6",
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
type PromptMode = "preview" | "edit";

function isCanceledRequestError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "CanceledError" ||
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("canceled")
  );
}

function getMaxOutputTokensError(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return "Max output tokens is required.";
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return "Enter a whole number greater than 0.";
  }

  const numericValue = Number(trimmedValue);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return "Enter a whole number greater than 0.";
  }

  return "";
}

function normalizePromptContent(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function MarkdownPreview({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const cleanedMarkdown = markdown
    .replace(/[ \t]+\r?\n/g, "\n")
    .replace(/\r\n/g, "\n");

  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          a: ({ children, href, title }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {cleanedMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function formatVersionHistoryDate(value: string) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);

  return `${dateLabel} ${timeLabel}`;
}

interface VersionHistoryOption {
  createdAtUtc: string;
  displayLabel: string;
  id: string;
  isCurrent: boolean;
  modifiedAtUtc?: string;
  promptVersion?: number;
}

function getVersionHistoryLabel(option: VersionHistoryOption) {
  if (typeof option.promptVersion === "number") {
    return `Version ${option.promptVersion}`;
  }

  const versionNumber = /\d+(?!.*\d)/.exec(option.displayLabel)?.[0];

  return versionNumber ? `Version ${versionNumber}` : option.displayLabel;
}

function getVersionHistoryTimestamp(option: VersionHistoryOption) {
  return option.modifiedAtUtc ?? option.createdAtUtc;
}

function VersionStatusBadge({
  isCurrent,
  isDropdown = false,
}: {
  isCurrent: boolean;
  isDropdown?: boolean;
}) {
  return (
    <span
      className={`shrink-0 px-2 py-0.5 text-[11px] leading-4 ${
        isCurrent
          ? "rounded-full bg-[#eaf7ed] font-medium text-[#16a34a]"
          : isDropdown
            ? "rounded-full bg-[#fff4d6] font-medium text-[#d97706]"
            : "rounded-[6px] border border-[#f2c94c] bg-[#fff8e6] font-bold text-[#d97706]"
      }`}
      data-qaautomationid={
        isCurrent
          ? "prompts-version-status-current"
          : "prompts-version-status-preview"
      }
    >
      {isCurrent ? "Current" : isDropdown ? "Preview" : "PREVIEW"}
    </span>
  );
}

function VersionHistoryDropdown({
  options,
  value,
  onChange,
}: {
  options: VersionHistoryOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllVersions, setShowAllVersions] = useState(false);

  const selectedOption =
    options.find((option) => option.id === value) ?? options[0];
  const triggerLabel = selectedOption?.isCurrent
    ? "Current Version"
    : selectedOption
      ? getVersionHistoryLabel(selectedOption)
      : "Current Version";

  const filteredOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      getVersionHistoryLabel(option).toLowerCase().includes(normalizedQuery),
    );
  }, [options, searchQuery]);

  const visibleOptions =
    searchQuery.trim() || showAllVersions
      ? filteredOptions
      : filteredOptions.slice(0, 6);

  const hasMoreThanSixVersions = filteredOptions.length > 6;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);

        if (!nextOpen) {
          setSearchQuery("");
          setShowAllVersions(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 min-w-[168px] items-center justify-between gap-3 rounded-[10px] border border-[#c9c2bf] bg-white px-3 text-sm font-medium text-[#272423] outline-none transition hover:border-[#a89f9d] focus:border-[#01579b] focus:shadow-[0_0_0_1px_rgba(1,87,155,0.12)]"
          data-qaautomationid="prompts-version-history-button"
        >
          <span className="truncate">{triggerLabel}</span>
          <IconChevronDown
            size={16}
            stroke={1.8}
            className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[320px] overflow-hidden rounded-[14px] border border-[#d8d2d0] bg-white p-0 shadow-[0_24px_60px_rgba(39,36,35,0.18)]"
        data-qaautomationid="prompts-version-history-popover"
      >
        <div className="border-b border-[#ece7e5] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-[#272423]">
              Version History
            </h3>
          </div>

          <div className="relative mt-2">
            <IconSearch
              size={14}
              stroke={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8f8583]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search Versions"
              className="h-10 w-full rounded-[8px] border border-[#d8d2d0] bg-white pl-9 pr-3 text-sm text-[#272423] outline-none placeholder:text-[#8f8583] focus:border-[#1658d3] focus:ring-4 focus:ring-[#1658d3]/10"
              data-qaautomationid="prompts-version-history-search"
            />
          </div>
        </div>

        <div className="max-h-[440px] overflow-y-auto">
          {visibleOptions.length > 0 ? (
            visibleOptions.map((option) => {
              const isSelected = option.id === value;

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`flex !h-auto w-full items-start justify-between gap-3 border-b border-[#ece7e5] px-2 py-1.5 text-left transition last:border-b-0 ${
                    isSelected ? "bg-[#f3f1f0]" : "bg-white hover:bg-[#f7f4f3]"
                  }`}
                  data-qaautomationid={`prompts-version-history-item-${toTestIdSegment(option.displayLabel)}`}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearchQuery("");
                    setShowAllVersions(false);
                  }}
                >
                  <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center text-[#272423]">
                    {isSelected ? <IconCheck size={14} stroke={2.2} /> : null}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-suisse overflow-hidden text-ellipsis text-sm font-medium leading-5 text-[#272423]">
                      {getVersionHistoryLabel(option)}
                    </span>
                    <span className="font-suisse overflow-hidden text-ellipsis text-xs font-normal leading-[18px] text-[#272423]">
                      {formatVersionHistoryDate(
                        getVersionHistoryTimestamp(option),
                      )}
                    </span>
                  </span>

                  {isSelected || option.isCurrent ? (
                    <div className="mt-0.5 shrink-0">
                      <VersionStatusBadge
                        isCurrent={option.isCurrent}
                        isDropdown
                      />
                    </div>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="px-4 py-6 text-sm text-[#6b7280]">
              No versions found.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#ece7e5] px-4 py-2 text-xs text-[#6b7280]">
          <span>
            Showing latest{" "}
            {searchQuery.trim() || showAllVersions || !hasMoreThanSixVersions
              ? filteredOptions.length
              : Math.min(filteredOptions.length, 6)}{" "}
            versions
          </span>
          {searchQuery.trim() || !hasMoreThanSixVersions ? null : (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-[#1658d3] transition hover:text-[#124bb5]"
              data-qaautomationid="prompts-version-history-view-all-button"
              onClick={() => setShowAllVersions(true)}
            >
              View All
              <IconChevronDown size={12} stroke={2} />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ResizablePromptBox({
  children,
  contentKey,
  minHeight,
  maxHeight,
  initialHeight,
  className = "",
  contentClassName = "h-full px-4 py-3",
  autoSizeOnLoad = true,
  testId,
}: {
  children: ReactNode;
  contentKey: unknown;
  minHeight: number;
  maxHeight?: number;
  initialHeight?: number;
  className?: string;
  contentClassName?: string;
  autoSizeOnLoad?: boolean;
  testId?: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedRef = useRef(false);

  useLayoutEffect(() => {
    hasInitializedRef.current = false;
  }, [contentKey]);

  useLayoutEffect(() => {
    const frameElement = frameRef.current;
    const contentElement =
      frameElement?.firstElementChild as HTMLDivElement | null;

    if (!frameElement || !contentElement) {
      return;
    }

    const initializeHeight = () => {
      if (hasInitializedRef.current) {
        return;
      }

      const contentHeight = contentElement.scrollHeight + 24;
      const baseHeight = initialHeight ?? minHeight;
      const targetHeight = autoSizeOnLoad
        ? Math.max(
            baseHeight,
            Math.min(contentHeight, maxHeight ?? contentHeight),
          )
        : baseHeight;

      frameElement.style.height = `${targetHeight}px`;
      hasInitializedRef.current = true;
    };

    initializeHeight();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => initializeHeight())
        : null;

    resizeObserver?.observe(contentElement);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [contentKey, minHeight, maxHeight, initialHeight, autoSizeOnLoad]);

  return (
    <div
      ref={frameRef}
      className={`min-h-0 resize-y overflow-auto rounded-[6px] border border-[#d6d8db] bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1658d3] ${className}`}
      style={{ minHeight: `${minHeight}px` }}
      tabIndex={0}
      data-qaautomationid={testId}
    >
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

function PromptModeTabs({
  value,
  onChange,
}: {
  value: PromptMode;
  onChange: (value: PromptMode) => void;
}) {
  const tabClassName = (isActive: boolean) =>
    [
      "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border px-4 text-sm font-medium transition",
      isActive
        ? "border-[#1658d3] bg-[#eaf1ff] text-[#1658d3] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        : "border-[#d1d5db] bg-white text-[#374151] hover:bg-[#f9fafb]",
    ].join(" ");

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        className={tabClassName(value === "preview")}
        data-qaautomationid="prompts-mode-tab-preview"
        onClick={() => onChange("preview")}
      >
        <IconEye size={14} />
        Preview
      </button>
      <button
        type="button"
        className={tabClassName(value === "edit")}
        data-qaautomationid="prompts-mode-tab-edit"
        onClick={() => onChange("edit")}
      >
        <IconCode size={14} />
        Edit
      </button>
    </div>
  );
}

function GeneratedPromptSection({
  title,
  description,
  prompt,
  isGenerating,
  successMessage,
  loadingHeading,
  loadingBody,
  loadingFootnote,
  errorMessage,
  canceledMessage,
  showSuccessBanner,
  onRetry,
  onCopy,
  onReplace,
  replaceLabel,
}: {
  title: string;
  description: string;
  prompt?: string;
  isGenerating?: boolean;
  successMessage: string;
  loadingHeading: string;
  loadingBody: string;
  loadingFootnote?: string;
  errorMessage?: string | null;
  canceledMessage?: string | null;
  showSuccessBanner?: boolean;
  onRetry: () => void;
  onCopy: () => void;
  onReplace: () => void;
  replaceLabel: string;
}) {
  return (
    <section
      className="flex flex-col"
      data-qaautomationid={`prompts-${toTestIdSegment(title)}-generated-section`}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-medium text-foreground-primary">
            {title}
          </h2>
          <p className="text-sm text-[#4b5563]">{description}</p>
        </div>

        {isGenerating ? (
          <div className="flex flex-col gap-4 rounded-[6px] border border-[#4f46e5] bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <IconLoader2
                size={18}
                stroke={2.1}
                className="shrink-0 animate-spin text-[#272423]"
              />
              <p className="text-sm font-medium text-[#2b2b2b]">
                {loadingHeading}
              </p>
            </div>
            <p className="text-sm leading-6 text-[#2b2b2b]">{loadingBody}</p>
            {loadingFootnote ? (
              <p className="text-sm leading-6 text-[#2b2b2b]">
                {loadingFootnote}
              </p>
            ) : null}
          </div>
        ) : errorMessage ? (
          <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#f0d5d5] bg-[#fff3f3] px-4 py-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 text-[#c81e1e]">
              <IconAlertCircle size={14} stroke={2.2} aria-hidden="true" />
              <span className="font-medium">{errorMessage}</span>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-[6px] bg-[#075eab] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#064f91]"
              data-qaautomationid={`prompts-${toTestIdSegment(title)}-retry-button`}
              onClick={onRetry}
            >
              <IconRefresh size={12} stroke={2} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : canceledMessage ? (
          <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#d9d9d9] bg-[#f7f7f8] px-4 py-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 text-[#374151]">
              <IconInfoCircle size={14} stroke={2.2} aria-hidden="true" />
              <span className="font-medium">{canceledMessage}</span>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-[6px] bg-[#075eab] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#064f91]"
              data-qaautomationid={`prompts-${toTestIdSegment(title)}-retry-button`}
              onClick={onRetry}
            >
              <IconRefresh size={12} stroke={2} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : showSuccessBanner !== false ? (
          <>
            <div className="flex items-center gap-4 rounded-[10px] border border-[#cde7d5] bg-[#f3fcf6] px-4 py-3 text-sm text-[#2b2b2b] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex items-center gap-2">
                <IconCheck size={14} stroke={2.2} className="text-[#22c55e]" />
                <span className="font-medium text-[#166534]">
                  {successMessage}
                </span>
              </div>
            </div>

            <ResizablePromptBox
              contentKey="generated-eligibility"
              minHeight={300}
              initialHeight={300}
              autoSizeOnLoad={false}
              testId={`prompts-${toTestIdSegment(title)}-preview-box`}
            >
              <MarkdownPreview
                markdown={prompt ?? ""}
                className={promptPreviewScopeClassName}
              />
            </ResizablePromptBox>
            <div className="flex flex-col gap-1 pt-2">
              <p className="text-sm font-medium text-foreground-primary">
                Do you want to:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm font-medium text-[#1658d3] marker:text-[#1658d3]">
                <li className="leading-5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 !px-0 !py-0 underline decoration-[#1658d3] underline-offset-2 transition hover:text-[#124bb5]"
                    data-qaautomationid={`prompts-${toTestIdSegment(title)}-copy-button`}
                    onClick={onCopy}
                  >
                    Copy the entire prompt to clipboard
                  </button>
                </li>
                <li className="leading-5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 !px-0 !py-0 underline decoration-[#1658d3] underline-offset-2 transition hover:text-[#124bb5]"
                    data-qaautomationid={`prompts-${toTestIdSegment(title)}-replace-button`}
                    onClick={onReplace}
                  >
                    {replaceLabel}
                  </button>
                </li>
              </ul>
            </div>
          </>
        ) : (
          <>
            <ResizablePromptBox
              contentKey="generated-summary"
              minHeight={300}
              initialHeight={300}
              autoSizeOnLoad={false}
              testId={`prompts-${toTestIdSegment(title)}-preview-box`}
            >
              <MarkdownPreview
                markdown={prompt ?? ""}
                className={promptPreviewScopeClassName}
              />
            </ResizablePromptBox>

            <div className="flex flex-col gap-1 pt-2">
              <p className="text-sm font-medium text-foreground-primary">
                Do you want to:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm font-medium text-[#1658d3] marker:text-[#1658d3]">
                <li className="leading-5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 !px-0 !py-0 underline decoration-[#1658d3] underline-offset-2 transition hover:text-[#124bb5]"
                    data-qaautomationid={`prompts-${toTestIdSegment(title)}-copy-button`}
                    onClick={onCopy}
                  >
                    Copy the entire prompt to clipboard
                  </button>
                </li>
                <li className="leading-5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 !px-0 !py-0 underline decoration-[#1658d3] underline-offset-2 transition hover:text-[#124bb5]"
                    data-qaautomationid={`prompts-${toTestIdSegment(title)}-replace-button`}
                    onClick={onReplace}
                  >
                    {replaceLabel}
                  </button>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function PromptGenerationCard({
  title,
  description,
  buttonLabel,
  onClick,
  onCancel,
  canCancel,
  disabled,
  isGenerating,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  onCancel: () => void;
  canCancel?: boolean;
  disabled?: boolean;
  isGenerating?: boolean;
}) {
  return (
    <section
      className={`flex h-full w-[369px] shrink-0 flex-col items-start gap-5 rounded-[18px] border bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${
        isGenerating ? "border-[#4f46e5]" : "border-[#d0cdca]"
      }`}
      data-qaautomationid={`prompts-${toTestIdSegment(title)}-generation-card`}
    >
      <div
        className={`flex h-full w-full flex-col ${
          isGenerating ? "gap-2" : "gap-6"
        }`}
      >
        <div className="space-y-1.5">
          <h3 className="text-[18px] font-semibold leading-6 text-[#2b2b2b]">
            {title}
          </h3>
          <p className="max-w-[290px] text-sm  text-[#6b7280]">{description}</p>
        </div>

        <div className="mt-auto flex w-full">
          {isGenerating ? (
            <div className="-mx-3 flex h-[calc(var(--height-h-10,40px)+16px)] w-[calc(100%+24px)] items-center justify-between gap-4 rounded-[8px] border-2 border-dashed border-[#f5b301] px-3">
              <div className="flex min-w-0 items-center gap-3 text-sm font-semibold text-[#2b2b2b]">
                <IconHourglass
                  size={18}
                  stroke={2.2}
                  className="text-[#d6a300]"
                />
                <span>{buttonLabel}</span>
              </div>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-[#ef4c42] bg-[#fff5f5] px-4 py-0 text-sm font-medium text-[#ef3124] transition hover:bg-[#ffeaea] disabled:cursor-not-allowed disabled:opacity-70"
                onClick={onCancel}
                disabled={disabled ? true : !canCancel}
                data-qaautomationid={`prompts-${toTestIdSegment(title)}-cancel-generation-button`}
              >
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-[3px] bg-[#ef3124]"
                />
                {disabled ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="flex h-[var(--height-h-10,40px)] flex-[1_0_0] items-center justify-center gap-[var(--spacing-2,8px)] bg-white text-sm font-medium text-[#2b2b2b] transition hover:bg-[#f7f7f8] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                border: "1px solid var(--border-strong, #272423)",
                borderRadius: "var(--border-radius-md, 8px)",
                padding: "var(--spacing-2, 8px) var(--spacing-4, 16px)",
              }}
              onClick={onClick}
              disabled={disabled}
              data-qaautomationid={`prompts-${toTestIdSegment(title)}-generate-button`}
            >
              <IconSparkles size={24} className="shrink-0 text-[#9490DB]" />
              <span>{buttonLabel}</span>
              {/* <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#272423] text-[#272423]">
                <IconCheck size={10} stroke={2.5} />
              </span> */}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function PromptConfiguration() {
  const queryClient = useQueryClient();
  const {
    getPromptFile,
    getPromptJob,
    registerPromptJob,
    removeJob,
    updateJob,
  } = useJobRegistry();
  const pageTopRef = useRef<HTMLDivElement | null>(null);
  const referenceDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const eligibilityPromptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const summaryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedModel, setSelectedModel] = useState(
    promptConfigurationData.model,
  );
  const [reasoningEffort, setReasoningEffort] = useState(
    promptConfigurationData.reasoningEffort,
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    promptConfigurationData.maxOutputTokens.toString(),
  );
  const [maxOutputTokensError, setMaxOutputTokensError] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState(
    promptConfigurationData.selectedVersionId,
  );
  const [eligibilityPrompt, setEligibilityPrompt] = useState(
    promptConfigurationData.eligibilityPrompt,
  );
  const [summaryPrompt, setSummaryPrompt] = useState(
    promptConfigurationData.summaryPrompt,
  );
  const [isEditingEligibilityPrompt, setIsEditingEligibilityPrompt] =
    useState(false);
  const [isEditingSummaryPrompt, setIsEditingSummaryPrompt] = useState(false);
  const [pageBanner, setPageBanner] = useState<PromptPageBanner>(null);
  const [isReplacePromptDialogOpen, setIsReplacePromptDialogOpen] =
    useState(false);
  const [replacePromptTarget, setReplacePromptTarget] =
    useState<PromptType | null>(null);
  const [isRestoreCurrentDialogOpen, setIsRestoreCurrentDialogOpen] =
    useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState<
    Record<PromptType, boolean>
  >({
    main: false,
    summary: false,
  });
  const [isCancellingPrompt, setIsCancellingPrompt] = useState<
    Record<PromptType, boolean>
  >({
    main: false,
    summary: false,
  });
  const generationRequestIds = useRef<Record<PromptType, number>>({
    main: 0,
    summary: 0,
  });
  const [generationJobIds, setGenerationJobIds] = useState<
    Record<PromptType, number>
  >({
    main: 0,
    summary: 0,
  });
  const generationAbortControllers = useRef<
    Record<PromptType, AbortController | null>
  >({
    main: null,
    summary: null,
  });
  const handledPromptJobIds = useRef(new Set<number>());
  const isPromptPageMountedRef = useRef(true);
  const [isSavingConfiguration, setIsSavingConfiguration] = useState(false);
  const [isRestoringCurrentVersion, setIsRestoringCurrentVersion] =
    useState(false);
  const [referenceDocument, setReferenceDocument] =
    useState<ReferenceDocument>(null);
  const [generatedPromptPreviews, setGeneratedPromptPreviews] = useState<
    Record<PromptType, string>
  >({
    main: "",
    summary: "",
  });
  const [generatedPromptBannerVisible, setGeneratedPromptBannerVisible] =
    useState<Record<PromptType, boolean>>({
      main: false,
      summary: false,
    });
  const [generatedPromptErrors, setGeneratedPromptErrors] = useState<
    Record<PromptType, string | null>
  >({
    main: null,
    summary: null,
  });
  const [generatedPromptCanceledMessages, setGeneratedPromptCanceledMessages] =
    useState<Record<PromptType, string | null>>({
      main: null,
      summary: null,
    });

  useEffect(() => {
    if (!generatedPromptBannerVisible.main) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGeneratedPromptBannerVisible((current) => ({
        ...current,
        main: false,
      }));
    }, 5_000);

    return () => window.clearTimeout(timeoutId);
  }, [generatedPromptBannerVisible.main]);

  useEffect(() => {
    if (!generatedPromptBannerVisible.summary) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGeneratedPromptBannerVisible((current) => ({
        ...current,
        summary: false,
      }));
    }, 5_000);

    return () => window.clearTimeout(timeoutId);
  }, [generatedPromptBannerVisible.summary]);
  const { data: promptConfiguration, error: promptConfigurationError } =
    useQuery<CurrentPromptConfigurationItem>({
      queryKey: PROMPT_CONFIGURATION_QUERY_KEY,
      queryFn: getCurrentPromptConfiguration,
      staleTime: PROMPT_CONFIGURATION_QUERY_CACHE_TIME,
      gcTime: PROMPT_CONFIGURATION_QUERY_CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  const currentPromptConfigurationId =
    promptConfiguration?.promptConfigurationId;
  const trackedMainPromptJob = getPromptJob(
    currentPromptConfigurationId,
    "main",
  );
  const trackedSummaryPromptJob = getPromptJob(
    currentPromptConfigurationId,
    "summary",
  );

  useEffect(() => {
    isPromptPageMountedRef.current = true;
    return () => {
      isPromptPageMountedRef.current = false;
    };
  }, []);
  const parsedSelectedVersionId = Number(selectedVersionId);
  const shouldLoadSelectedVersion =
    Number.isFinite(parsedSelectedVersionId) &&
    parsedSelectedVersionId > 0 &&
    currentPromptConfigurationId !== undefined &&
    parsedSelectedVersionId !== currentPromptConfigurationId;

  useEffect(() => {
    const trackedJobs = [trackedMainPromptJob, trackedSummaryPromptJob];
    const trackedReferenceDocument = trackedJobs.find(
      (trackedJob) => trackedJob?.referenceDocumentName,
    );

    const trackedReferenceDocumentName =
      trackedReferenceDocument?.referenceDocumentName;
    const trackedReferenceDocumentSize =
      trackedReferenceDocument?.referenceDocumentSize;

    if (trackedReferenceDocumentName) {
      const trackedReferenceFile = getPromptFile(currentPromptConfigurationId);
      queueMicrotask(() => {
        setReferenceDocument(
          (current) =>
            current ?? {
              file: trackedReferenceFile,
              fileName: trackedReferenceDocumentName,
              fileSize: trackedReferenceDocumentSize,
            },
        );
      });
    }

    trackedJobs.forEach((trackedJob) => {
      if (!trackedJob?.promptType) {
        return;
      }

      const promptType = trackedJob.promptType;
      const normalizedStatus = trackedJob.status.trim().toUpperCase();
      setGenerationJobIds((current) => ({
        ...current,
        [promptType]: trackedJob.jobId,
      }));

      if (ACTIVE_PROMPT_JOB_STATUSES.has(normalizedStatus)) {
        setIsGeneratingPrompt((current) =>
          current[promptType] ? current : { ...current, [promptType]: true },
        );
        return;
      }

      if (handledPromptJobIds.current.has(trackedJob.jobId)) {
        return;
      }

      handledPromptJobIds.current.add(trackedJob.jobId);
      setIsGeneratingPrompt((current) => ({
        ...current,
        [promptType]: false,
      }));

      if (normalizedStatus !== "COMPLETED") {
        if (FAILED_PROMPT_JOB_STATUSES.has(normalizedStatus)) {
          setGeneratedPromptErrors((current) => ({
            ...current,
            [promptType]: PROMPT_GENERATION_ERROR_MESSAGES[promptType],
          }));
        } else if (CANCELED_PROMPT_JOB_STATUSES.has(normalizedStatus)) {
          setGeneratedPromptCanceledMessages((current) => ({
            ...current,
            [promptType]: PROMPT_GENERATION_CANCELED_MESSAGES[promptType],
          }));
        }
        setGenerationJobIds((current) => ({
          ...current,
          [promptType]: 0,
        }));
        if (!CANCELED_PROMPT_JOB_STATUSES.has(normalizedStatus)) {
          removeJob(trackedJob.jobId);
        }
        return;
      }

      let wasHandled = false;

      void getCompletedSuggestedPrompt(trackedJob.jobId, {
        skipRequestTracking: true,
      })
        .then((response) => {
          if (!isPromptPageMountedRef.current) {
            return;
          }

          wasHandled = true;
          setGeneratedPromptPreviews((current) => ({
            ...current,
            [promptType]: response.generatedPromptReview,
          }));
          setGeneratedPromptBannerVisible((current) => ({
            ...current,
            [promptType]: true,
          }));
          setGeneratedPromptErrors((current) => ({
            ...current,
            [promptType]: null,
          }));
          setGeneratedPromptCanceledMessages((current) => ({
            ...current,
            [promptType]: null,
          }));
          setReferenceDocument((current) =>
            current && response.documentName
              ? {
                  ...current,
                  fileName: response.documentName,
                  fileSize: response.fileSize,
                }
              : current,
          );
          setPageBanner(null);
        })
        .catch((error) => {
          if (
            isPromptPageMountedRef.current &&
            !isCanceledRequestError(error)
          ) {
            wasHandled = true;
            setGeneratedPromptErrors((current) => ({
              ...current,
              [promptType]: PROMPT_GENERATION_ERROR_MESSAGES[promptType],
            }));
          }
        })
        .finally(() => {
          if (!wasHandled) {
            handledPromptJobIds.current.delete(trackedJob.jobId);
            return;
          }

          setGenerationJobIds((current) => ({
            ...current,
            [promptType]: 0,
          }));
          removeJob(trackedJob.jobId);
        });
    });
  }, [
    currentPromptConfigurationId,
    getPromptFile,
    removeJob,
    trackedMainPromptJob,
    trackedSummaryPromptJob,
  ]);
  const {
    data: selectedPromptConfiguration,
    error: selectedPromptConfigurationError,
  } = useQuery<CurrentPromptConfigurationItem>({
    queryKey: [
      ...PROMPT_CONFIGURATION_VERSION_QUERY_KEY,
      parsedSelectedVersionId,
    ],
    queryFn: () => getPromptConfigurationVersion(parsedSelectedVersionId),
    enabled: shouldLoadSelectedVersion,
    staleTime: PROMPT_CONFIGURATION_QUERY_CACHE_TIME,
    gcTime: PROMPT_CONFIGURATION_QUERY_CACHE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!promptConfiguration) {
      return;
    }

    queueMicrotask(() => {
      setSelectedModel(promptConfiguration.aiModelName);
      setReasoningEffort(promptConfiguration.reasoningEffort);
      setMaxOutputTokens(promptConfiguration.maxOutputTokens.toString());
      setMaxOutputTokensError("");
      setEligibilityPrompt(promptConfiguration.eligibilityPrompt);
      setSummaryPrompt(promptConfiguration.summaryPrompt);
      setIsEditingEligibilityPrompt(false);
      setIsEditingSummaryPrompt(false);
      setSelectedVersionId(String(promptConfiguration.promptConfigurationId));
      setPageBanner(null);
    });
  }, [promptConfiguration]);

  useEffect(() => {
    if (!selectedPromptConfiguration) {
      return;
    }

    queueMicrotask(() => {
      setSelectedModel(selectedPromptConfiguration.aiModelName);
      setReasoningEffort(selectedPromptConfiguration.reasoningEffort);
      setMaxOutputTokens(
        selectedPromptConfiguration.maxOutputTokens.toString(),
      );
      setMaxOutputTokensError("");
      setEligibilityPrompt(selectedPromptConfiguration.eligibilityPrompt);
      setSummaryPrompt(selectedPromptConfiguration.summaryPrompt);
      setIsEditingEligibilityPrompt(false);
      setIsEditingSummaryPrompt(false);
      setPageBanner(null);
    });
  }, [selectedPromptConfiguration]);

  useEffect(() => {
    if (!promptConfiguration || shouldLoadSelectedVersion) {
      return;
    }

    queueMicrotask(() => {
      setSelectedModel(promptConfiguration.aiModelName);
      setReasoningEffort(promptConfiguration.reasoningEffort);
      setMaxOutputTokens(promptConfiguration.maxOutputTokens.toString());
      setMaxOutputTokensError("");
      setEligibilityPrompt(promptConfiguration.eligibilityPrompt);
      setSummaryPrompt(promptConfiguration.summaryPrompt);
      setIsEditingEligibilityPrompt(false);
      setIsEditingSummaryPrompt(false);
      setPageBanner(null);
    });
  }, [promptConfiguration, shouldLoadSelectedVersion]);

  useEffect(() => {
    if (!promptConfigurationError) {
      return;
    }

    toast.error("Unable to load prompt configuration.");
  }, [promptConfigurationError]);

  useEffect(() => {
    if (!selectedPromptConfigurationError) {
      return;
    }

    toast.error("Unable to load the selected prompt version.");
  }, [selectedPromptConfigurationError]);

  const displayedPromptConfiguration =
    selectedPromptConfiguration ?? promptConfiguration;
  const isPreviewVersion = shouldLoadSelectedVersion;
  const hasPromptConfigurationChanges = useMemo(() => {
    if (!displayedPromptConfiguration) {
      return false;
    }

    return (
      selectedModel !== displayedPromptConfiguration.aiModelName ||
      reasoningEffort !== displayedPromptConfiguration.reasoningEffort ||
      maxOutputTokens.trim() !==
        displayedPromptConfiguration.maxOutputTokens.toString() ||
      normalizePromptContent(eligibilityPrompt) !==
        normalizePromptContent(
          displayedPromptConfiguration.eligibilityPrompt,
        ) ||
      normalizePromptContent(summaryPrompt) !==
        normalizePromptContent(displayedPromptConfiguration.summaryPrompt)
    );
  }, [
    displayedPromptConfiguration,
    selectedModel,
    reasoningEffort,
    maxOutputTokens,
    eligibilityPrompt,
    summaryPrompt,
  ]);
  const isSaveConfigurationDisabled =
    isSavingConfiguration ||
    isGeneratingPrompt.main ||
    isGeneratingPrompt.summary ||
    maxOutputTokensError.length > 0 ||
    !hasPromptConfigurationChanges;

  const modelOptions = displayedPromptConfiguration?.availableModels.length
    ? displayedPromptConfiguration.availableModels
    : [
        { value: "GPT-5.2", label: "GPT-5.2", isDefault: false },
        { value: "GPT-4.1", label: "GPT-4.1", isDefault: false },
        { value: "GPT-4o", label: "GPT-4o", isDefault: false },
      ];
  const reasoningOptions = displayedPromptConfiguration
    ?.availableReasoningEfforts.length
    ? displayedPromptConfiguration.availableReasoningEfforts
    : [
        { value: "Low", label: "Low", isDefault: false },
        { value: "Medium", label: "Medium", isDefault: false },
        { value: "High", label: "High", isDefault: false },
      ];
  const versionOptions = displayedPromptConfiguration?.versionHistory.length
    ? displayedPromptConfiguration.versionHistory
    : promptConfigurationData.versions.map((version) => ({
        id: version.id,
        displayLabel: version.label,
        createdAtUtc: version.createdAtUtc,
        modifiedAtUtc: version.createdAtUtc,
        isCurrent: version.id === promptConfigurationData.currentVersionId,
      }));

  const openReferenceDocumentPicker = () => {
    referenceDocumentInputRef.current?.click();
  };

  const scrollToTopBanner = () => {
    pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showPageBanner = (nextBanner: PromptPageBanner) => {
    setPageBanner(nextBanner);
    window.requestAnimationFrame(scrollToTopBanner);
  };

  const applyPromptConfigurationToForm = (
    configuration: CurrentPromptConfigurationItem,
  ) => {
    setSelectedModel(configuration.aiModelName);
    setReasoningEffort(configuration.reasoningEffort);
    setMaxOutputTokens(configuration.maxOutputTokens.toString());
    setMaxOutputTokensError("");
    setEligibilityPrompt(configuration.eligibilityPrompt);
    setSummaryPrompt(configuration.summaryPrompt);
    setIsEditingEligibilityPrompt(false);
    setIsEditingSummaryPrompt(false);
    setSelectedVersionId(String(configuration.promptConfigurationId));
  };

  const buildSavePayload = (
    nextEligibilityPrompt = eligibilityPrompt,
  ): SavePromptConfigurationRequest => ({
    aiModelName: selectedModel,
    reasoningEffort,
    eligibilityPrompt: nextEligibilityPrompt,
    summaryPrompt,
    maxOutputTokens: Number(maxOutputTokens),
  });

  const updateCurrentPromptConfiguration = (
    configuration: CurrentPromptConfigurationItem,
  ) => {
    queryClient.setQueryData(PROMPT_CONFIGURATION_QUERY_KEY, configuration);
    applyPromptConfigurationToForm(configuration);
  };

  const handleSaveConfiguration = async (
    nextEligibilityPrompt = eligibilityPrompt,
  ) => {
    if (isGeneratingPrompt.main || isGeneratingPrompt.summary) {
      return null;
    }

    const nextMaxOutputTokensError = getMaxOutputTokensError(maxOutputTokens);

    if (nextMaxOutputTokensError) {
      setMaxOutputTokensError(nextMaxOutputTokensError);
      toast.error(nextMaxOutputTokensError);
      return null;
    }

    try {
      setIsSavingConfiguration(true);
      const savedConfiguration = await savePromptConfiguration(
        buildSavePayload(nextEligibilityPrompt),
      );

      updateCurrentPromptConfiguration(savedConfiguration.configuration);
      showPageBanner("save-success");

      return savedConfiguration;
    } catch {
      toast.error("Unable to save prompt configuration.");
      return null;
    } finally {
      setIsSavingConfiguration(false);
    }
  };

  const handleReferenceDocumentChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      event.target.value = "";
      toast.error("Please upload a PDF document.");
      return;
    }

    if (selectedFile.size > MAX_REFERENCE_DOCUMENT_FILE_SIZE_BYTES) {
      event.target.value = "";
      toast.error("File too large. Max file size 100MB.");
      return;
    }

    setReferenceDocument({
      file: selectedFile,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
    });
    setGeneratedPromptPreviews({
      main: "",
      summary: "",
    });
    setGeneratedPromptBannerVisible({
      main: false,
      summary: false,
    });
    setGeneratedPromptErrors({
      main: null,
      summary: null,
    });
    setGeneratedPromptCanceledMessages({
      main: null,
      summary: null,
    });
    event.target.value = "";
    toast.success("Reference document updated.");
  };

  const handleRemoveReferenceDocument = () => {
    setReferenceDocument(null);
    setGeneratedPromptPreviews({
      main: "",
      summary: "",
    });
    setGeneratedPromptBannerVisible({
      main: false,
      summary: false,
    });
    setGeneratedPromptErrors({
      main: null,
      summary: null,
    });
    setGeneratedPromptCanceledMessages({
      main: null,
      summary: null,
    });
    toast.success("Reference document removed.");
  };

  const cancelPromptGeneration = async (promptType: PromptType) => {
    const jobId = generationJobIds[promptType];

    if (!jobId) {
      return;
    }

    setIsCancellingPrompt((current) => ({
      ...current,
      [promptType]: true,
    }));

    try {
      await cancelGeneratedSuggestedPrompt(jobId, {
        skipRequestTracking: true,
      });

      generationRequestIds.current[promptType] += 1;
      generationAbortControllers.current[promptType]?.abort();
      setGenerationJobIds((current) => ({
        ...current,
        [promptType]: 0,
      }));
      updateJob(jobId, { status: "CANCELED" });
      setIsGeneratingPrompt((current) => ({
        ...current,
        [promptType]: false,
      }));
      setGeneratedPromptErrors((current) => ({
        ...current,
        [promptType]: null,
      }));
      setGeneratedPromptBannerVisible((current) => ({
        ...current,
        [promptType]: false,
      }));
      setGeneratedPromptCanceledMessages((current) => ({
        ...current,
        [promptType]: PROMPT_GENERATION_CANCELED_MESSAGES[promptType],
      }));
    } catch {
      setGeneratedPromptErrors((current) => ({
        ...current,
        [promptType]: PROMPT_GENERATION_ERROR_MESSAGES[promptType],
      }));
    } finally {
      setIsCancellingPrompt((current) => ({
        ...current,
        [promptType]: false,
      }));
      generationAbortControllers.current[promptType] = null;
    }
  };

  const handleCopyGeneratedPrompt = async (promptType: PromptType) => {
    const prompt = generatedPromptPreviews[promptType];

    if (!prompt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Generated prompt copied.");
    } catch {
      toast.error("Unable to copy the generated prompt.");
    }
  };

  const handleReplaceGeneratedPrompt = (promptType: PromptType) => {
    const prompt = generatedPromptPreviews[promptType];

    if (!prompt) {
      return;
    }

    if (promptType === "main") {
      setEligibilityPrompt(prompt);
    } else {
      setSummaryPrompt(prompt);
    }

    setIsReplacePromptDialogOpen(false);
    setReplacePromptTarget(null);
    showPageBanner("apply-success");
  };

  const handleGenerateSuggestedPrompt = async (promptType: PromptType) => {
    const nextRequestId = generationRequestIds.current[promptType] + 1;
    let wasQueued = false;
    generationRequestIds.current[promptType] = nextRequestId;
    setGenerationJobIds((current) => ({
      ...current,
      [promptType]: 0,
    }));

    const abortController = new AbortController();
    generationAbortControllers.current[promptType] = abortController;

    setIsGeneratingPrompt((current) => ({
      ...current,
      [promptType]: true,
    }));
    setGeneratedPromptBannerVisible((current) => ({
      ...current,
      [promptType]: false,
    }));
    setGeneratedPromptErrors((current) => ({
      ...current,
      [promptType]: null,
    }));
    setGeneratedPromptCanceledMessages((current) => ({
      ...current,
      [promptType]: null,
    }));

    try {
      const response = await queueSuggestedPromptJob(
        referenceDocument?.file,
        promptType,
        {
          skipRequestTracking: true,
          signal: abortController.signal,
        },
      );

      if (generationRequestIds.current[promptType] !== nextRequestId) {
        return;
      }

      wasQueued = true;
      setGenerationJobIds((current) => ({
        ...current,
        [promptType]: response.jobId,
      }));
      registerPromptJob({
        jobId: response.jobId,
        configurationId: currentPromptConfigurationId,
        promptType,
        status: response.jobStatus,
        scheduledAt: response.scheduledAt,
        referenceDocumentName: referenceDocument?.fileName,
        referenceDocumentSize: referenceDocument?.fileSize,
        referenceFile: referenceDocument?.file,
      });
    } catch (error) {
      if (generationRequestIds.current[promptType] !== nextRequestId) {
        return;
      }

      if (isCanceledRequestError(error)) {
        return;
      }

      setGeneratedPromptErrors((current) => ({
        ...current,
        [promptType]: PROMPT_GENERATION_ERROR_MESSAGES[promptType],
      }));
    } finally {
      if (
        !wasQueued &&
        generationRequestIds.current[promptType] === nextRequestId
      ) {
        setIsGeneratingPrompt((current) => ({
          ...current,
          [promptType]: false,
        }));
      }

      generationAbortControllers.current[promptType] = null;
    }
  };

  const replacePromptDialogTitle =
    replacePromptTarget === "summary"
      ? "Replace draft summary prompt?"
      : "Replace draft eligibility prompt?";
  const replacePromptDialogDescription =
    replacePromptTarget === "summary"
      ? "This will replace the summary prompt currently shown in the editor with the newly generated version. You can review and edit it before saving."
      : "This will replace the eligibility prompt currently shown in the editor with the newly generated version. You can review and edit it before saving.";

  const handleRestoreAsCurrent = async () => {
    if (
      !shouldLoadSelectedVersion ||
      isGeneratingPrompt.main ||
      isGeneratingPrompt.summary
    ) {
      return;
    }

    try {
      setIsRestoringCurrentVersion(true);
      await setCurrentPromptConfigurationVersion(parsedSelectedVersionId);
      await queryClient.invalidateQueries({
        queryKey: PROMPT_CONFIGURATION_QUERY_KEY,
      });
      await queryClient.invalidateQueries({
        queryKey: PROMPT_CONFIGURATION_VERSION_QUERY_KEY,
      });
      setIsRestoreCurrentDialogOpen(false);
      showPageBanner("save-success");
      toast.success("Version restored as current.");
    } catch {
      toast.error("Unable to restore the selected version.");
    } finally {
      setIsRestoringCurrentVersion(false);
    }
  };

  return (
    <main>
      <div ref={pageTopRef} />
      <Dialog
        open={isReplacePromptDialogOpen}
        onOpenChange={(open) => {
          setIsReplacePromptDialogOpen(open);
          if (!open) {
            setReplacePromptTarget(null);
          }
        }}
      >
        <DialogContent
          hideCloseIcon
          className="max-w-[560px] rounded-[12px] border border-[#d6d8db] bg-white p-0 shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
          data-qaautomationid="prompts-replace-draft-dialog"
        >
          <div className="flex flex-col gap-5 px-6 py-6">
            <div className="flex flex-col gap-2">
              <DialogTitle className="text-base font-semibold leading-6 text-[#2b2b2b]">
                {replacePromptDialogTitle}
              </DialogTitle>
              <DialogDescription className="max-w-[500px] space-y-4 text-sm leading-5 text-[#5f6368]">
                <span className="block">{replacePromptDialogDescription}</span>
                <span className="block">
                  This change will not become official until you select Save
                  Configuration, and it will not affect existing reviews unless
                  they are re-run using the saved prompt.
                </span>
              </DialogDescription>
            </div>

            <DialogFooter className="gap-3 space-x-0 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-[8px] border border-[#8d8785] bg-white px-4 py-2 text-sm font-medium text-[#2b2b2b] transition hover:bg-[#f7f7f8]"
                data-qaautomationid="prompts-keep-current-draft-button"
                onClick={() => setIsReplacePromptDialogOpen(false)}
              >
                Keep Current Draft
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-[8px] bg-[#0967b2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#075a9b]"
                data-qaautomationid="prompts-replace-draft-button"
                onClick={() => {
                  if (!replacePromptTarget) {
                    return;
                  }

                  handleReplaceGeneratedPrompt(replacePromptTarget);
                }}
              >
                Replace Draft
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isRestoreCurrentDialogOpen}
        onOpenChange={setIsRestoreCurrentDialogOpen}
      >
        <DialogContent
          hideCloseIcon
          className="max-w-[560px] rounded-2xl border border-[#d6d8db] bg-white p-0 shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
        >
          <div className="flex flex-col gap-6 px-8 py-7">
            <div className="flex flex-col gap-3">
              <DialogTitle className="text-[30px] font-semibold leading-9 text-[#2b2b2b]">
                Restore this version as Current?
              </DialogTitle>
              <DialogDescription className="max-w-[460px] text-base leading-6 text-[#5f6368]">
                This will replace the current eligibility prompt with this
                version. This action can be undone from Version History.
              </DialogDescription>
            </div>

            <DialogFooter className="flex-row justify-end gap-3 space-x-0">
              <button
                type="button"
                className="inline-flex min-w-[96px] items-center justify-center rounded-[10px] border border-[#c4c7c5] bg-white px-4 py-2.5 text-sm font-medium text-[#2b2b2b] transition hover:bg-[#f7f7f8]"
                data-qaautomationid="prompts-restore-current-cancel-button"
                onClick={() => setIsRestoreCurrentDialogOpen(false)}
                disabled={isRestoringCurrentVersion}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-w-[176px] items-center justify-center rounded-[10px] bg-[#1658d3] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#124bb5]"
                data-qaautomationid="prompts-restore-current-confirm-button"
                onClick={() => void handleRestoreAsCurrent()}
                disabled={
                  isRestoringCurrentVersion ||
                  isGeneratingPrompt.main ||
                  isGeneratingPrompt.summary
                }
              >
                {isRestoringCurrentVersion
                  ? "Restoring..."
                  : "Restore as Current"}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <div
        className="flex flex-col gap-6 px-16 pb-10"
        data-qaautomationid="prompts-page"
      >
        <section className="bg-white pt-3">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-[32px] font-medium leading-[38.4px] tracking-[-0.32px] text-[#111827]">
                Configuration
              </h1>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground-secondary">
                  Select AI Model
                </span>
                <SelectDropdown
                  value={selectedModel}
                  onChange={setSelectedModel}
                  className={promptFieldClassName}
                  testId="prompts-model-select"
                  options={modelOptions.map((model) => ({
                    label: model.label,
                    value: model.value,
                  }))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground-secondary">
                  Reasoning Effort
                </span>
                <SelectDropdown
                  value={reasoningEffort}
                  onChange={setReasoningEffort}
                  className={promptFieldClassName}
                  testId="prompts-reasoning-effort-select"
                  options={reasoningOptions.map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))}
                />
              </div>

              <label className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground-secondary">
                  <span>Max Output Tokens</span>
                  <span
                    className="inline-flex -translate-y-[1px] text-[#01579b]"
                    title={
                      "Max Output Tokens: Sets the maximum length of the AI's response. Increase this if you need longer or more detailed answers.\nLimits: OpenAI GPT: 128K | Claude: 128K | Grok: 64K"
                    }
                  >
                    <IconInfoCircle size={14} stroke={1.8} aria-hidden="true" />
                  </span>
                </span>
                <input
                  value={maxOutputTokens}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/[^\d]/g, "");
                    setMaxOutputTokens(nextValue);
                    setMaxOutputTokensError(getMaxOutputTokensError(nextValue));
                  }}
                  className={promptFieldClassName}
                  inputMode="numeric"
                  aria-invalid={maxOutputTokensError.length > 0}
                  aria-describedby={
                    maxOutputTokensError ? "max-output-tokens-error" : undefined
                  }
                  pattern="[0-9]*"
                  type="text"
                  data-qaautomationid="prompts-max-output-tokens-input"
                />
                <FormFieldError
                  id="max-output-tokens-error"
                  message={maxOutputTokensError}
                />
              </label>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-medium text-foreground-primary">
              Eligibility Prompt
            </h2>
            {isPreviewVersion ? <VersionStatusBadge isCurrent={false} /> : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center rounded-[6px] border border-[#1658d3] bg-[#1658d3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#124bb5] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaveConfigurationDisabled}
              data-qaautomationid="prompts-save-configuration-button"
              onClick={() => void handleSaveConfiguration()}
            >
              {isSavingConfiguration ? "Saving..." : "Save Configuration"}
            </button>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground-secondary">
              <span>Version History</span>
              <span
                className="inline-flex -translate-y-[2px] text-[#01579b]"
                title="The dropdown shows all the previous Saved prompts and it's configurations."
              >
                <IconInfoCircle size={14} stroke={1.8} aria-hidden="true" />
              </span>
            </span>
            <VersionHistoryDropdown
              value={selectedVersionId}
              onChange={setSelectedVersionId}
              options={versionOptions}
            />
            {shouldLoadSelectedVersion ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center rounded-[6px] border border-[#1658d3] bg-[#1658d3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#124bb5]"
                data-qaautomationid="prompts-restore-as-current-button"
                onClick={() => setIsRestoreCurrentDialogOpen(true)}
                disabled={isGeneratingPrompt.main || isGeneratingPrompt.summary}
              >
                Restore as Current
              </button>
            ) : null}
          </div>
        </div>

        {isPreviewVersion ? (
          <div
            className="flex items-center gap-2 rounded-[4px] border border-[#e2bd36] bg-[#fffdf0] px-4 py-2 text-sm font-medium leading-5 text-[#3f3a36]"
            data-qaautomationid="prompts-prior-version-notice"
            role="status"
          >
            <IconEye
              size={16}
              stroke={2}
              className="shrink-0 text-[#9a7b00]"
              aria-hidden="true"
            />
            <p>
              You are viewing a prior version of the Eligibility Prompt. This is
              not the current version. To make this the current version, click
              &quot;Restore as Current&quot;.
            </p>
          </div>
        ) : null}

        {pageBanner === "apply-success" ? (
          <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#d5e7dc] bg-[#f3fcf6] px-6 py-4 text-[18px] font-semibold leading-7 text-[#2b2b2b] shadow-[0_10px_30px_rgba(39,36,35,0.08)]">
            <div className="flex items-center gap-2 text-base font-medium text-[#166534]">
              <IconCheck size={16} stroke={2.2} className="text-[#22c55e]" />
              <span>Reference document applied to prompt.</span>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-[8px] border border-[#d1d5db] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] transition hover:bg-[#f9fafb]"
              data-qaautomationid="prompts-apply-success-dismiss-button"
              onClick={() => setPageBanner(null)}
            >
              <IconX size={12} stroke={2} />
              Cancel
            </button>
          </div>
        ) : null}

        {pageBanner === "save-success" ? (
          <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#d5e7dc] bg-[#f3fcf6] px-6 py-4 text-[18px] font-semibold leading-7 text-[#2b2b2b] shadow-[0_10px_30px_rgba(39,36,35,0.08)]">
            <div className="flex items-center gap-2 text-base font-medium text-[#166534]">
              <IconCheck size={16} stroke={2.2} className="text-[#22c55e]" />
              <span>Configuration saved successfully.</span>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-[8px] border border-[#d1d5db] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] transition hover:bg-[#f9fafb]"
              data-qaautomationid="prompts-save-success-dismiss-button"
              onClick={() => setPageBanner(null)}
            >
              <IconX size={12} stroke={2} />
              Cancel
            </button>
          </div>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex justify-start">
            <PromptModeTabs
              value={isEditingEligibilityPrompt ? "edit" : "preview"}
              onChange={(value) =>
                setIsEditingEligibilityPrompt(value === "edit")
              }
            />
          </div>

          {isEditingEligibilityPrompt ? (
            <ResizablePromptBox
              contentKey="eligibility-editor"
              minHeight={240}
              maxHeight={737}
              className="bg-[#F7F7F8]"
              contentClassName="h-full px-4 py-4"
              testId="prompts-eligibility-prompt-editor"
            >
              <textarea
                ref={eligibilityPromptTextareaRef}
                value={eligibilityPrompt}
                onChange={(event) => setEligibilityPrompt(event.target.value)}
                className="h-full w-full resize-none border-0 bg-transparent p-0 text-base font-normal leading-6 text-[#2B2B2B] outline-none"
              />
            </ResizablePromptBox>
          ) : (
            <ResizablePromptBox
              contentKey="eligibility-preview"
              minHeight={240}
              maxHeight={737}
              className="bg-[#F7F7F8]"
              contentClassName="h-full px-4 py-4"
              testId="prompts-eligibility-prompt-preview"
            >
              <MarkdownPreview
                markdown={eligibilityPrompt}
                className={promptPreviewScopeClassName}
              />
            </ResizablePromptBox>
          )}
        </section>

        <section className="flex flex-col gap-3 self-stretch">
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-medium text-foreground-primary">
                Summary Prompt
              </h2>
              <p className="text-sm text-foreground-secondary">
                This will define how the summary or excerpt of the review will
                be written.
              </p>
              <p className="text-xs leading-5 text-[#6b7280]">
                The first 250 characters will appear in the Summary on the
                Review Results table, so include the most important information
                first.
              </p>
            </div>
            {isPreviewVersion ? <VersionStatusBadge isCurrent={false} /> : null}
          </div>
          <div className="flex justify-start">
            <PromptModeTabs
              value={isEditingSummaryPrompt ? "edit" : "preview"}
              onChange={(value) => setIsEditingSummaryPrompt(value === "edit")}
            />
          </div>

          {isEditingSummaryPrompt ? (
            <ResizablePromptBox
              contentKey="summary-editor"
              minHeight={160}
              maxHeight={300}
              className="bg-[#F7F7F8]"
              contentClassName="h-full px-4 py-4"
              testId="prompts-summary-prompt-editor"
            >
              <textarea
                ref={summaryTextareaRef}
                value={summaryPrompt}
                onChange={(event) => setSummaryPrompt(event.target.value)}
                className="h-full w-full resize-none border-0 bg-transparent p-0 text-base font-normal leading-6 text-[#2B2B2B] outline-none"
              />
            </ResizablePromptBox>
          ) : (
            <ResizablePromptBox
              contentKey="summary-preview"
              minHeight={160}
              maxHeight={300}
              className="bg-[#F7F7F8]"
              contentClassName="h-full px-4 py-4"
              testId="prompts-summary-prompt-preview"
            >
              <MarkdownPreview
                markdown={summaryPrompt}
                className={promptPreviewScopeClassName}
              />
            </ResizablePromptBox>
          )}
        </section>

        <section className="flex flex-col gap-4 py-3 px-8 border-l-4 border-l-[#9CA3AF]">
          <input
            ref={referenceDocumentInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleReferenceDocumentChange}
          />{" "}
          <div className="flex flex-col gap-4 self-stretch">
            <button
              type="button"
              className="!h-auto !p-5 flex items-center gap-4 self-start rounded-[8px] bg-[#F0EFEE] text-left transition hover:bg-[#e8e7e5]"
              data-qaautomationid="prompts-upload-reference-document-button"
              onClick={openReferenceDocumentPicker}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-black shadow-[0_1px_2px_rgba(17,24,39,0.08)]">
                <IconUpload size={20} stroke={2} />
              </span>
              <span className="text-[18px] font-medium leading-7 text-[#111827]">
                Upload Reference Document (Optional)
              </span>
            </button>

            {referenceDocument ? (
              <div className="flex flex-col items-start gap-4 self-stretch rounded-[10px] border border-[#d6d8db] bg-[#f8f8f9] p-6 shadow-[0_4px_10px_rgba(17,24,39,0.03)]">
                <div className="flex w-full flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[14px] font-medium leading-6 text-[#3f3f46]">
                      {referenceDocument.fileName}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-[6px] border border-[#1658d3] bg-white px-4 py-2 text-xs font-medium text-[#1658d3] transition hover:bg-[#f4f8ff]"
                      data-qaautomationid="prompts-replace-reference-document-button"
                      onClick={openReferenceDocumentPicker}
                    >
                      Replace Document
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-[6px] border border-[#1658d3] bg-white px-4 py-2 text-xs font-medium text-[#1658d3] transition hover:bg-[#f4f8ff]"
                      data-qaautomationid="prompts-remove-reference-document-button"
                      onClick={handleRemoveReferenceDocument}
                    >
                      Remove Document
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-6">
              <PromptGenerationCard
                title="Eligibility Prompt"
                description="Create an eligibility-focused prompt."
                buttonLabel={
                  isGeneratingPrompt.main
                    ? "Generating..."
                    : "Generate Eligibility Prompt"
                }
                onClick={() => {
                  void handleGenerateSuggestedPrompt("main");
                }}
                onCancel={() => {
                  void cancelPromptGeneration("main");
                }}
                isGenerating={isGeneratingPrompt.main}
                canCancel={generationJobIds.main > 0}
                disabled={isCancellingPrompt.main}
              />

              <PromptGenerationCard
                title="Summary Prompt"
                description="Create a summary-focused prompt."
                buttonLabel={
                  isGeneratingPrompt.summary
                    ? "Generating..."
                    : "Generate Summary Prompt"
                }
                onClick={() => {
                  void handleGenerateSuggestedPrompt("summary");
                }}
                onCancel={() => {
                  void cancelPromptGeneration("summary");
                }}
                isGenerating={isGeneratingPrompt.summary}
                canCancel={generationJobIds.summary > 0}
                disabled={isCancellingPrompt.summary}
              />
            </div>
          </div>
        </section>
        {generatedPromptPreviews.main ||
        isGeneratingPrompt.main ||
        generatedPromptErrors.main ||
        generatedPromptCanceledMessages.main ? (
          <GeneratedPromptSection
            title="Generated Prompt Preview"
            description=""
            prompt={generatedPromptPreviews.main}
            isGenerating={isGeneratingPrompt.main}
            showSuccessBanner={generatedPromptBannerVisible.main}
            successMessage="Prompt preview generated. Review the draft before applying it."
            loadingHeading="Generating prompt preview..."
            loadingBody="We're analyzing the uploaded reference document to create a draft eligibility prompt."
            loadingFootnote="This may take few minutes."
            errorMessage={generatedPromptErrors.main}
            canceledMessage={generatedPromptCanceledMessages.main}
            replaceLabel="Replace existing eligibility prompt"
            onRetry={() => {
              void handleGenerateSuggestedPrompt("main");
            }}
            onCopy={() => {
              void handleCopyGeneratedPrompt("main");
            }}
            onReplace={() => {
              setReplacePromptTarget("main");
              setIsReplacePromptDialogOpen(true);
            }}
          />
        ) : null}

        {generatedPromptPreviews.summary ||
        isGeneratingPrompt.summary ||
        generatedPromptErrors.summary ||
        generatedPromptCanceledMessages.summary ? (
          <GeneratedPromptSection
            title="Generated Summary Prompt"
            description="We've identified relevant information from your document. Review and adjust the prompt before saving."
            prompt={generatedPromptPreviews.summary}
            isGenerating={isGeneratingPrompt.summary}
            showSuccessBanner={generatedPromptBannerVisible.summary}
            successMessage="Summary prompt generated. Review the draft before applying it."
            loadingHeading="Generating summary prompt..."
            loadingBody="We're analyzing the uploaded reference document to create a draft summary prompt."
            loadingFootnote="This may take few minutes."
            errorMessage={generatedPromptErrors.summary}
            canceledMessage={generatedPromptCanceledMessages.summary}
            replaceLabel="Replace existing summary prompt"
            onRetry={() => {
              void handleGenerateSuggestedPrompt("summary");
            }}
            onCopy={() => {
              void handleCopyGeneratedPrompt("summary");
            }}
            onReplace={() => {
              setReplacePromptTarget("summary");
              setIsReplacePromptDialogOpen(true);
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
