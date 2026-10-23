//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";

import { getCaseDocumentContent } from "@/services";

const DOCUMENT_PREVIEW_QUERY_CACHE_TIME = Infinity;

function buildPdfViewerUrl(objectUrl: string, hash: string) {
  if (!objectUrl) {
    return "";
  }

  const pageValue = new URLSearchParams(hash.replace(/^#/, "")).get("page");
  const pageNumber = Number(pageValue);

  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    return objectUrl;
  }

  return `${objectUrl}#page=${pageNumber}`;
}

function useObjectUrl(blob: Blob | null) {
  return useMemo(() => {
    if (!blob) {
      return "";
    }

    return URL.createObjectURL(blob);
  }, [blob]);
}

export default function DocumentPreview() {
  const { caseId, documentId } = useParams();
  const { hash } = useLocation();
  const parsedDocumentId = Number(documentId);
  const parsedCaseId = Number(caseId);

  const {
    data: documentBlob = null,
    isLoading,
    error,
  } = useQuery<Blob>({
    queryKey: ["case-document-content", parsedDocumentId],
    queryFn: () => getCaseDocumentContent(parsedDocumentId),
    enabled: Number.isFinite(parsedDocumentId) && Number.isFinite(parsedCaseId),
    staleTime: DOCUMENT_PREVIEW_QUERY_CACHE_TIME,
    gcTime: DOCUMENT_PREVIEW_QUERY_CACHE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const objectUrl = useObjectUrl(documentBlob);
  const viewerUrl = useMemo(
    () => buildPdfViewerUrl(objectUrl, hash),
    [hash, objectUrl],
  );

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  return (
    <div className="fixed inset-0 bg-white">
      {isLoading || error || !objectUrl ? null : (
        <iframe
          title="Document preview"
          src={viewerUrl}
          className="h-full w-full border-0 bg-white"
        />
      )}
    </div>
  );
}
