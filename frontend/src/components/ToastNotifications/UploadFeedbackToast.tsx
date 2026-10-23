//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { toast } from "sonner";

const VISIBLE_FILE_COUNT = 3;

export function showUploadSuccessToast(
  fileNames: string[],
  toasterId?: string,
) {
  const visibleFileNames = fileNames.slice(0, VISIBLE_FILE_COUNT);
  const remainingFileCount = fileNames.length - visibleFileNames.length;
  const fileLabel = fileNames.length === 1 ? "File" : "Files";

  toast.custom(
    () => (
      <div className="w-[396px] rounded-[8px] border border-[#c9ded1] bg-[#f1fff7] px-6 py-5 text-[#272423] shadow-[0_10px_20px_rgba(0,0,0,0.22)]">
        <p className="text-sm font-semibold">
          {fileNames.length} {fileLabel} uploaded successfully
        </p>
        <p className="mt-2 text-sm">
          The following files were added for case review:
        </p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {visibleFileNames.map((fileName) => (
            <li key={fileName}>{fileName}</li>
          ))}
        </ul>
        {remainingFileCount > 0 ? (
          <p className="ml-5 text-sm">{remainingFileCount} more</p>
        ) : null}
      </div>
    ),
    { duration: 6000, toasterId },
  );
}

export function showUploadErrorToast(
  message: string,
  onRetry: () => void,
  toasterId?: string,
) {
  toast.custom(
    (toastId) => (
      <div className="flex w-[396px] items-center justify-between gap-5 rounded-[8px] border border-[#f0c5c2] bg-[#fff4f3] px-6 py-5 text-[#f22d2d] shadow-[0_10px_20px_rgba(0,0,0,0.22)]">
        <div>
          <p className="text-sm font-semibold">Upload failed</p>
          <p className="mt-2 text-sm leading-5">{message}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-[9px] border border-[#f22d2d] px-4 py-2 text-sm font-medium"
          onClick={() => {
            toast.dismiss(toastId);
            onRetry();
          }}
        >
          Try again
        </button>
      </div>
    ),
    { duration: Infinity, toasterId },
  );
}
