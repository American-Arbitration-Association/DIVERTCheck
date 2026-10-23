//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export function buildDocumentPreviewUrl(
  caseId: number | string,
  documentId: number | string,
) {
  return `/cases/${caseId}/documents/${documentId}/preview`;
}

const DOCUMENT_CONTENT_PATH_PATTERN =
  /\/cases\/documents\/(?<documentId>\d+)\/content\/?$/i;

/**
 * Converts a review citation's document-content API URL into the in-app
 * document viewer URL. Non-citation links are returned unchanged.
 */
export function buildCitationPreviewUrl(
  citationUrl: string | undefined,
  caseId: number | string,
) {
  if (!citationUrl) {
    return citationUrl;
  }

  try {
    const parsedCitationUrl = new URL(citationUrl, window.location.origin);
    const documentId = DOCUMENT_CONTENT_PATH_PATTERN.exec(
      parsedCitationUrl.pathname,
    )?.groups?.documentId;

    if (!documentId) {
      return citationUrl;
    }

    const viewerUrl = buildDocumentPreviewUrl(caseId, documentId);
    const page = new URLSearchParams(
      parsedCitationUrl.hash.replace(/^#/, ""),
    ).get("page");
    const pageNumber = Number(page);

    return Number.isSafeInteger(pageNumber) && pageNumber > 0
      ? `${viewerUrl}#page=${pageNumber}`
      : viewerUrl;
  } catch {
    return citationUrl;
  }
}
