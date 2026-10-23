//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export interface ResponseMessageLike {
  message?: string;
  title?: string;
  detail?: string;
  error?: string;
}

export function getResponseMessage(response: unknown) {
  if (typeof response === "string") {
    return response.trim();
  }

  if (!response || typeof response !== "object") {
    return "";
  }

  const messageResponse = response as ResponseMessageLike;

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
