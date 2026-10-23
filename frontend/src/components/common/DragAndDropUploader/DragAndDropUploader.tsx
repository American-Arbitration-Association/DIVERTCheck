//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// import useDragDetection from "@/hooks/useDragDetection";
import { cn } from "@/lib/utils";
import { useId } from "react";
import "./DragAndDropUploader.css";

export interface DragAndDropUploaderProps {
  readonly errorMessage?: string;
  readonly onFilesAdded: (files: FileList) => void;
  readonly onOpenFileDialog: () => void;
  readonly testId?: string;
}

function DragAndDropUploader({
  errorMessage,
  onFilesAdded,
  onOpenFileDialog,
  testId,
}: DragAndDropUploaderProps) {
  const uploaderId = useId();
  // const { draggedIntoZone, onDragEnter, onDragLeave } = useDragDetection();

  const ids = {
    windowHeading: `${uploaderId}-window-heading`,
    helpText: `${uploaderId}-help-text`,
  };

  function onFileDrop(e: React.DragEvent) {
    e.preventDefault();
    // onDragLeave();
    onFilesAdded(e.dataTransfer.files);
  }

  return (
    <div
      tabIndex={0}
      data-qaautomationid={testId}
      aria-describedby={`${ids.windowHeading} ${ids.helpText}`}
      onDrop={onFileDrop}
      onDragOver={(e) => e.preventDefault()}
      // onDragEnter={onDragEnter}
      // onDragLeave={onDragLeave}
      onClick={onOpenFileDialog}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onOpenFileDialog();
        }
      }}
      className={cn(
        "uploadWindow",
        // draggedIntoZone && styles.activeUploadWindow,
      )}
    >
      <label
        id={ids.windowHeading}
        className={"windowHeading"}
        htmlFor={uploaderId}
        data-qaautomationid={testId ? `${testId}-label` : undefined}
      >
        <div className="mb-3 flex items-center justify-center gap-3">
          <button
            className="white"
            type="button"
            data-qaautomationid={testId ? `${testId}-browse-button` : undefined}
          >
            Browse...
          </button>
          <p className="font-medium text-sm">Or drop PDF files here</p>
        </div>
        <p className="text-xs font-normal leading-[18px] text-[#1E1E1E]">
          Drag and drop files here, or browse to upload from your system.
        </p>
        <p className="text-xs font-normal leading-[18px] text-[#1E1E1E]">
          You can upload up to <b>10 files</b>. Maximum file size:{" "}
          <b>100 MB per file</b>.
        </p>
        {errorMessage ? (
          <p className="mt-3 text-sm leading-5 text-[#cf2a1b]">
            {errorMessage}
          </p>
        ) : null}
      </label>
    </div>
  );
}

export default DragAndDropUploader;
