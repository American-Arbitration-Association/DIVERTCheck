//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./apiConfig";
import type { CaseSubmittedBy } from "./cases";

export interface CaseDocumentSubmittedByOption {
  value: CaseSubmittedBy;
  label: string;
}

export async function getCaseDocumentSubmittedByOptions() {
  const response = await apiClient.get<CaseDocumentSubmittedByOption[]>(
    API_ENDPOINTS.caseDocumentsSubmittedBy,
  );

  return response.data;
}
