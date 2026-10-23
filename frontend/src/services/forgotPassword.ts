//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./index";

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordMessageResponse {
  message?: string;
  title?: string;
  detail?: string;
  error?: string;
}

export async function forgotPassword(payload: ForgotPasswordRequest) {
  const response = await apiClient.post<ForgotPasswordMessageResponse | string>(
    API_ENDPOINTS.forgotPassword,
    payload,
  );

  return response.data;
}
