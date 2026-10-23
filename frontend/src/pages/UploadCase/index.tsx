//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import DatePickerField from "@/components/common/DatePickerField/DatePickerField";
import DragAndDropUploader from "@/components/common/DragAndDropUploader/DragAndDropUploader";
import SelectDropdown from "@/components/common/SelectDropdown";
import { showValidationToast } from "@/components/ToastNotifications/showValidationToast";
import {
  showUploadErrorToast,
  showUploadSuccessToast,
} from "@/components/ToastNotifications/UploadFeedbackToast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCaseUpload,
  getCaseDocumentSubmittedByOptions,
  getReviewQueue,
  type CaseDocumentSubmittedByOption,
  type CaseSubmittedBy,
} from "@/services";
import {
  IconArrowDown,
  IconArrowUp,
  IconInfoCircle,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { toTestIdSegment } from "@/lib/utils";

const FALLBACK_SUBMITTED_BY_OPTIONS: CaseDocumentSubmittedByOption[] = [
  { value: "P", label: "Plaintiff" },
  { value: "D", label: "Defendant" },
];
const MAX_UPLOAD_FILE_COUNT = 10;
const MAX_UPLOAD_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_FILE_COUNT_ERROR =
  "Failed to upload document(s). You can upload up to 10 files.";

interface UploadedDocumentRow {
  id: string;
  file: File;
  submittedBy: CaseSubmittedBy;
  isTransactionEvidence: boolean;
}

type UploadedDocumentColumnKey =
  | "documentName"
  | "transactionEvidence"
  | "submittedBy"
  | "size";
type SortDirection = "asc" | "desc";

interface UploadedDocumentSortConfig {
  key: UploadedDocumentColumnKey;
  direction: SortDirection;
}

function getUploadedDocumentSortIcon(
  sortConfig: UploadedDocumentSortConfig,
  columnKey: UploadedDocumentColumnKey,
) {
  if (sortConfig.key !== columnKey) {
    return <IconArrowUp size={13} className="shrink-0 text-[#c6bfbd]" />;
  }

  return sortConfig.direction === "asc" ? (
    <IconArrowUp size={13} className="shrink-0 text-[#272423]" />
  ) : (
    <IconArrowDown size={13} className="shrink-0 text-[#272423]" />
  );
}

function compareUploadedDocuments(
  leftDocument: UploadedDocumentRow,
  rightDocument: UploadedDocumentRow,
  sortConfig: UploadedDocumentSortConfig,
) {
  let comparison = 0;

  switch (sortConfig.key) {
    case "documentName":
      comparison = leftDocument.file.name.localeCompare(
        rightDocument.file.name,
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
        undefined,
        { numeric: true, sensitivity: "base" },
      );
      break;
    case "size":
      comparison = leftDocument.file.size - rightDocument.file.size;
      break;
  }

  return sortConfig.direction === "asc" ? comparison : -comparison;
}

function UploadedFilesSortButton({
  columnKey,
  label,
  sortConfig,
  onSort,
}: {
  columnKey: UploadedDocumentColumnKey;
  label: string;
  sortConfig: UploadedDocumentSortConfig;
  onSort: (columnKey: UploadedDocumentColumnKey) => void;
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
      data-qaautomationid={`new-review-uploaded-files-sort-${toTestIdSegment(label)}`}
      onClick={() => onSort(columnKey)}
    >
      {getUploadedDocumentSortIcon(sortConfig, columnKey)}
    </button>
  );
}

function normalizeFileName(fileName: string) {
  return fileName.trim().toLowerCase();
}

function mergeUploadedFiles(
  currentFiles: UploadedDocumentRow[],
  incomingFiles: File[],
  defaultSubmittedBy: CaseSubmittedBy,
) {
  const existingFileNames = new Set(
    currentFiles.map((document) => normalizeFileName(document.file.name)),
  );
  const nextFiles: UploadedDocumentRow[] = [];
  const skippedDuplicates: string[] = [];

  incomingFiles.forEach((file) => {
    const normalizedName = normalizeFileName(file.name);

    if (
      existingFileNames.has(normalizedName) ||
      nextFiles.some(
        (document) => normalizeFileName(document.file.name) === normalizedName,
      )
    ) {
      skippedDuplicates.push(file.name);
      return;
    }

    existingFileNames.add(normalizedName);
    nextFiles.push({
      id: `${file.name}-${file.lastModified}-${nextFiles.length}`,
      file,
      submittedBy: defaultSubmittedBy,
      isTransactionEvidence: false,
    });
  });

  return { nextFiles, skippedDuplicates };
}

const DISALLOWED_CASE_NAME_CHARACTERS = /[^a-zA-Z0-9,'.-]/g;

function sanitizeCaseName(value: string) {
  return value.replace(DISALLOWED_CASE_NAME_CHARACTERS, "");
}

export default function UploadCase() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uploaderRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<UploadedDocumentRow[]>([]);
  const [sortConfig, setSortConfig] = useState<UploadedDocumentSortConfig>({
    key: "documentName",
    direction: "asc",
  });
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [caseName, setCaseName] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [filingDate, setFilingDate] = useState("");
  const [uploaderError, setUploaderError] = useState("");
  const [caseNameError, setCaseNameError] = useState("");
  const [caseNumberError, setCaseNumberError] = useState("");
  const { data: submittedByOptions } = useQuery({
    queryKey: ["case-documents", "submitted-by"],
    queryFn: getCaseDocumentSubmittedByOptions,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const availableSubmittedByOptions = useMemo(
    () =>
      submittedByOptions?.length
        ? submittedByOptions
        : FALLBACK_SUBMITTED_BY_OPTIONS,
    [submittedByOptions],
  );
  const sortedFiles = useMemo(
    () =>
      [...selectedFiles].sort((leftDocument, rightDocument) =>
        compareUploadedDocuments(leftDocument, rightDocument, sortConfig),
      ),
    [selectedFiles, sortConfig],
  );
  const { data: reviewQueue = [] } = useQuery({
    queryKey: ["review-queue"],
    queryFn: getReviewQueue,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const normalizedCaseName = caseName.trim().toLowerCase();
  const normalizedCaseNumber = caseNumber.trim().toLowerCase();
  const duplicateCaseName = reviewQueue.some(
    (reviewCase) =>
      normalizedCaseName.length > 0 &&
      reviewCase.caseName.trim().toLowerCase() === normalizedCaseName,
  );
  const duplicateCaseNumber = reviewQueue.some(
    (reviewCase) =>
      normalizedCaseNumber.length > 0 &&
      reviewCase.caseNumber.trim().toLowerCase() === normalizedCaseNumber,
  );

  const fieldClassName =
    "flex h-11 w-full rounded-lg border border-[#C1BAB8] bg-white px-3 py-2 text-sm leading-5 text-[#272423] outline-none transition placeholder:text-[#78716C] focus:border-[#01579b] focus:shadow-[0_0_0_1px_rgba(1,87,155,0.12)]";
  const fieldErrorClassName =
    "border-[#cf2a1b] focus:border-[#cf2a1b] focus:shadow-[0_0_0_1px_rgba(207,42,27,0.12)]";
  const fieldLabelClassName = "text-sm font-normal leading-none text-[#272423]";
  const fieldLabelErrorClassName =
    "text-sm font-normal leading-none text-[#cf2a1b]";
  const fieldErrorMessageClassName = "min-h-5 text-sm leading-5 text-[#cf2a1b]";

  const onFilesSelected = () => {
    const uploadEl = uploaderRef.current;
    if (!uploadEl?.files) return;
    handleFiles(uploadEl.files);
    uploadEl.value = "";
  };

  const handleFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files ?? []);
    if (fileArr.length === 0) return;

    setUploaderError("");

    if (selectedFiles.length + fileArr.length > MAX_UPLOAD_FILE_COUNT) {
      showUploadErrorToast(MAX_UPLOAD_FILE_COUNT_ERROR, openFileDialog);
      return;
    }

    const invalidFiles = fileArr.filter(
      (file) => file.type !== "application/pdf",
    );
    if (invalidFiles.length > 0) {
      showUploadErrorToast(
        "Invalid file type. Please upload PDF files only.",
        openFileDialog,
      );
      return;
    }

    const oversizedFile = fileArr.find(
      (file) => file.size > MAX_UPLOAD_FILE_SIZE_BYTES,
    );
    if (oversizedFile) {
      setUploaderError("File too large. Max file size 100MB.");
      return;
    }

    const currentFiles = selectedFiles;
    const defaultSubmittedBy = availableSubmittedByOptions[0]?.value ?? "P";
    const { nextFiles, skippedDuplicates } = mergeUploadedFiles(
      currentFiles,
      fileArr,
      defaultSubmittedBy,
    );

    if (skippedDuplicates.length > 0) {
      showUploadErrorToast(
        `A file named ${skippedDuplicates[0]} has already been uploaded.`,
        openFileDialog,
      );
    }

    if (nextFiles.length === 0) {
      return;
    }

    setSelectedFiles((current) => [...nextFiles, ...current]);
    showUploadSuccessToast(nextFiles.map((file) => file.file.name));
  };

  const openFileDialog = () => {
    uploaderRef.current?.click();
  };

  const handleSubmittedByChange = (
    documentId: string,
    submittedBy: CaseSubmittedBy,
  ) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.map((document) =>
        document.id === documentId ? { ...document, submittedBy } : document,
      ),
    );
  };

  const handleTransactionEvidenceChange = (
    documentId: string,
    isTransactionEvidence: boolean,
  ) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.map((document) =>
        document.id === documentId
          ? { ...document, isTransactionEvidence }
          : document,
      ),
    );
  };

  const handleSort = (columnKey: UploadedDocumentColumnKey) => {
    setSortConfig((currentSort) => ({
      key: columnKey,
      direction:
        currentSort.key === columnKey && currentSort.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const handleRemoveDocument = (documentId: string) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((document) => document.id !== documentId),
    );
  };

  const handleOpenDocumentPreview = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const openLink = document.createElement("a");

    openLink.href = objectUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.style.display = "none";

    document.body.appendChild(openLink);
    openLink.click();
    openLink.remove();

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  const resetUploadForm = () => {
    setSelectedFiles([]);
    setCaseName("");
    setCaseNumber("");
    setFilingDate("");
    setUploaderError("");
    setCaseNameError("");
    setCaseNumberError("");
    setShowConfirmation(false);

    if (uploaderRef.current) {
      uploaderRef.current.value = "";
    }
  };

  const validateSubmission = () => {
    if (selectedFiles.length === 0) {
      showUploadErrorToast("Please add at least one document.", openFileDialog);
      return false;
    }

    const nextCaseNameError = caseName.trim() ? "" : "This field is required.";
    const nextCaseNumberError = caseNumber.trim()
      ? ""
      : "This field is required.";

    if (nextCaseNameError || nextCaseNumberError) {
      setCaseNameError(nextCaseNameError);
      setCaseNumberError(nextCaseNumberError);
      return false;
    }

    if (duplicateCaseName || duplicateCaseNumber) {
      setCaseNameError(duplicateCaseName ? "Case name already exists." : "");
      setCaseNumberError(
        duplicateCaseNumber ? "Case number already exists." : "",
      );
      return false;
    }

    setCaseNameError("");
    setCaseNumberError("");
    return true;
  };

  function getResponseMessage(response: unknown) {
    if (typeof response === "string") {
      return response.trim();
    }

    if (!response || typeof response !== "object") {
      return "";
    }

    const messageResponse = response as {
      message?: string;
      title?: string;
      detail?: string;
      error?: string;
    };

    return (
      [
        messageResponse.message,
        messageResponse.title,
        messageResponse.detail,
        messageResponse.error,
      ]
        .find((message) => message?.trim())
        ?.trim() ?? ""
    );
  }

  const submitDocuments = async () => {
    if (!validateSubmission()) {
      return;
    }

    setIsSubmitting(true);

    const normalizedFilingDate =
      filingDate.trim() || new Date().toISOString().split("T")[0];

    try {
      await createCaseUpload({
        caseNumber: caseNumber.trim(),
        caseName: caseName.trim(),
        filingDate: normalizedFilingDate,
        documents: selectedFiles.map((document) => ({
          document: document.file,
          submittedBy: document.submittedBy,
          isTransactionEvidence: document.isTransactionEvidence,
        })),
      });

      showValidationToast("success", "Review initiated successfully", "");
      resetUploadForm();
      await queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      void navigate("/cases");
    } catch (error) {
      const responseMessage = axios.isAxiosError(error)
        ? getResponseMessage(error.response?.data)
        : "";

      showValidationToast(
        "error",
        responseMessage || "Unable to upload documents.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="mx-auto flex w-full  flex-col px-6 pb-8 pt-3 md:px-8 xl:px-16"
      data-qaautomationid="new-review-page"
    >
      <section
        className="flex flex-col gap-6"
        data-qaautomationid="new-review-section"
      >
        <div className="space-y-2">
          <h1
            className="text-[32px] font-medium leading-[38.4px] tracking-[-0.32px] text-[#111827]"
            data-qaautomationid="new-review-title"
          >
            New Review
          </h1>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
          <div className="grid min-w-0 gap-[10px]">
            <label
              className={
                caseNameError ? fieldLabelErrorClassName : fieldLabelClassName
              }
              data-qaautomationid="new-review-case-name-label"
            >
              Case Name <span className="required">*</span>
            </label>
            <input
              id="case-name-input"
              type="text"
              placeholder="Enter Case Name"
              className={`${fieldClassName} ${caseNameError ? fieldErrorClassName : ""}`}
              value={caseName}
              data-qaautomationid="new-review-case-name-input"
              onChange={(e) => {
                setCaseName(sanitizeCaseName(e.target.value));
                if (caseNameError) {
                  setCaseNameError("");
                }
              }}
              aria-invalid={caseNameError.length > 0}
              aria-describedby={caseNameError ? "case-name-error" : undefined}
            />
            {caseNameError ? (
              <p id="case-name-error" className={fieldErrorMessageClassName}>
                {caseNameError}
              </p>
            ) : null}
          </div>
          <div className="grid min-w-0 gap-[10px]">
            <label
              className={
                caseNumberError ? fieldLabelErrorClassName : fieldLabelClassName
              }
              data-qaautomationid="new-review-case-number-label"
            >
              Case Number <span className="required">*</span>
            </label>
            <input
              id="case-number-input"
              type="text"
              placeholder="Enter Case Number"
              className={`${fieldClassName} ${caseNumberError ? fieldErrorClassName : ""}`}
              value={caseNumber}
              data-qaautomationid="new-review-case-number-input"
              onChange={(e) => {
                setCaseNumber(e.target.value);
                if (caseNumberError) {
                  setCaseNumberError("");
                }
              }}
              aria-invalid={caseNumberError.length > 0}
              aria-describedby={
                caseNumberError ? "case-number-error" : undefined
              }
            />
            {caseNumberError ? (
              <p id="case-number-error" className={fieldErrorMessageClassName}>
                {caseNumberError}
              </p>
            ) : null}
          </div>
          <div className="grid min-w-0 gap-[10px]">
            <label className={fieldLabelClassName}>Filing Date</label>
            <DatePickerField
              ariaLabel="Filing Date"
              date={filingDate}
              onDateChange={setFilingDate}
              placeholder="MM/DD/YYYY"
              testId="new-review-filing-date"
            />
          </div>
        </div>

        <DragAndDropUploader
          errorMessage={uploaderError}
          onFilesAdded={handleFiles}
          onOpenFileDialog={openFileDialog}
          testId="new-review-upload"
        />

        <input
          ref={uploaderRef}
          className="hidden"
          placeholder="Internal File Input"
          type="file"
          accept=".pdf"
          multiple
          disabled={isSubmitting}
          data-qaautomationid="new-review-hidden-file-input"
          onChange={onFilesSelected}
        />

        {selectedFiles.length > 0 && (
          <div
            className="rounded-[16px] border border-[#dedad9] bg-white shadow-[0_8px_24px_rgba(39,36,35,0.04)]"
            data-qaautomationid="new-review-uploaded-files-panel"
          >
            <div className="border-b border-[#dedad9] px-6 py-4">
              <h2
                className="text-2xl font-medium leading-[38.4px] tracking-[-0.24px] text-[#272423]"
                data-qaautomationid="new-review-uploaded-files-title"
              >
                Uploaded Files - Properly Categorize Documents Before Running AI
                Review
              </h2>
            </div>

            <div className="overflow-hidden">
              <table
                className="w-full table-fixed border-collapse"
                data-qaautomationid="new-review-uploaded-files-table"
              >
                <colgroup>
                  <col className="w-[38%]" />
                  <col className="w-[14%]" />
                  <col className="w-[23%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-[#dedad9] bg-[#faf8f8] hover:bg-[#faf8f8]">
                    <th
                      aria-sort={
                        sortConfig.key === "documentName"
                          ? sortConfig.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="px-6 py-4 text-left text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]"
                    >
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span>Document NAME</span>
                        <UploadedFilesSortButton
                          columnKey="documentName"
                          label="Document Name"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </span>
                    </th>
                    <th
                      aria-sort={
                        sortConfig.key === "transactionEvidence"
                          ? sortConfig.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="px-4 py-4 text-center text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]"
                    >
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
                        <UploadedFilesSortButton
                          columnKey="transactionEvidence"
                          label="Transaction Evidence"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </span>
                    </th>
                    <th
                      aria-sort={
                        sortConfig.key === "submittedBy"
                          ? sortConfig.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="px-6 py-4 text-left text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]"
                    >
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span>SUBMITTED BY</span>
                        <UploadedFilesSortButton
                          columnKey="submittedBy"
                          label="Submitted By"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </span>
                    </th>
                    <th
                      aria-sort={
                        sortConfig.key === "size"
                          ? sortConfig.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="px-6 py-4 text-left text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]"
                    >
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span>SIZE</span>
                        <UploadedFilesSortButton
                          columnKey="size"
                          label="Size"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      </span>
                    </th>
                    <th className="w-20 px-6 py-4 text-center text-sm font-medium uppercase tracking-[0.04em] text-[#574e4d]">
                      ACTION
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFiles.map((document) => (
                    <tr
                      key={document.id}
                      className="border-b border-[#ece7e5] last:border-b-0 hover:bg-white"
                    >
                      <td className="px-6 py-4 align-middle">
                        <button
                          type="button"
                          className="block w-full truncate text-left text-sm leading-5 text-[#01579b] underline decoration-[#01579b] underline-offset-2"
                          data-qaautomationid={`new-review-uploaded-file-link-${toTestIdSegment(document.file.name)}`}
                          onClick={() =>
                            handleOpenDocumentPreview(document.file)
                          }
                        >
                          {document.file.name}
                        </button>
                      </td>
                      <td className="px-4 py-4 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={document.isTransactionEvidence}
                          onChange={(event) =>
                            handleTransactionEvidenceChange(
                              document.id,
                              event.target.checked,
                            )
                          }
                          aria-label={`Mark ${document.file.name} as transaction evidence`}
                          data-qaautomationid={`new-review-transaction-evidence-${toTestIdSegment(document.file.name)}`}
                          className="h-4 w-4 cursor-pointer accent-[#01579b]"
                        />
                      </td>
                      <td className="px-6 py-4 align-middle">
                        <SelectDropdown
                          value={document.submittedBy}
                          onChange={(value) =>
                            handleSubmittedByChange(
                              document.id,
                              value as CaseSubmittedBy,
                            )
                          }
                          className="h-11 w-full"
                          testId={`new-review-submitted-by-${toTestIdSegment(document.file.name)}`}
                          options={availableSubmittedByOptions.map(
                            (option) => ({
                              label: option.label,
                              value: option.value,
                            }),
                          )}
                        />
                      </td>
                      <td className="px-6 py-4 align-middle text-sm leading-5 text-[#272423]">
                        {formatFileSize(document.file.size)}
                      </td>
                      <td className="px-6 py-4 text-center align-middle">
                        <IconTrash
                          size={16}
                          stroke={1.8}
                          onClick={() => handleRemoveDocument(document.id)}
                          className="inline-flex items-center justify-center"
                          aria-label={`Remove ${document.file.name}`}
                          title="Delete file"
                          data-qaautomationid={`new-review-remove-file-${toTestIdSegment(document.file.name)}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[#dedad9] px-6 py-4 text-sm leading-5 text-[#574e4d]">
              {selectedFiles.length} file
              {selectedFiles.length === 1 ? "" : "s"} ready for review.
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            className="rounded-md bg-[#F0EFEE]"
            type="button"
            data-qaautomationid="new-review-cancel-button"
            onClick={resetUploadForm}
            disabled={
              selectedFiles.length === 0 &&
              caseName.length === 0 &&
              caseNumber.length === 0 &&
              filingDate.length === 0
            }
          >
            Cancel
          </button>
          <button
            disabled={selectedFiles.length === 0 || isSubmitting}
            className="confirm inline-flex items-center gap-2"
            type="button"
            data-qaautomationid="new-review-run-review-button"
            onClick={() => {
              if (validateSubmission()) {
                setShowConfirmation(true);
              }
            }}
          >
            <IconSparkles size={24} className="shrink-0 text-white" />
            Run Review
          </button>
        </div>
        <ConfirmUpload
          open={showConfirmation}
          onClose={() => {
            setShowConfirmation(false);
          }}
          submit={() => {
            setShowConfirmation(false);
            void submitDocuments();
          }}
        />
      </section>
    </div>
  );
}

const ConfirmUpload = ({
  open,
  onClose,
  submit,
}: {
  open: boolean;
  onClose: () => void;
  submit: () => void;
}) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        onEscapeKeyDown={onClose}
        onPointerDownOutside={onClose}
        hideCloseIcon={true}
        className="submitConfirmationWrapper"
        data-qaautomationid="new-review-confirmation-dialog"
      >
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle>Are you sure you want to run this review?</DialogTitle>
        </DialogHeader>
        <div className="text-sm  text-[#574e4d]">
          You&apos;re about to run the review for this case using the uploaded
          documents. Once started, the review process cannot be stopped.
        </div>
        <div className="flex flex-row justify-end gap-2">
          <button className="white" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="confirm inline-flex items-center gap-2"
            type="button"
            data-qaautomationid="new-review-confirmation-run-button"
            onClick={() => {
              onClose();
              submit();
            }}
          >
            <IconSparkles size={24} className="shrink-0 text-white" />
            Run Review
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
