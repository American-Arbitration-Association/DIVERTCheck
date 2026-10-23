//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./index";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginSuccessResponse {
  accessToken: string;
  user: {
    userId: number;
    email: string;
    roleCode: string;
    roleIndCode: string;
    lastLoginDttm?: string;
  };
}

export interface LoginMessageResponse {
  message?: string;
  title?: string;
  detail?: string;
  error?: string;
}

export interface VerifyResetPasswordEmailRequest {
  email: string;
  securityCode: string;
}

export interface ResetPasswordRequest {
  email: string;
  securityCode: string;
  newPassword: string;
}

export interface CurrentUserResponse {
  userId: number;
  email: string;
  roleCode: string;
  roleIndCode: string;
  lastLoginDttm?: string;
}

export async function loginUser(payload: LoginRequest) {
  const response = await apiClient.post<
    LoginSuccessResponse | LoginMessageResponse | string
  >(API_ENDPOINTS.loginUser, payload, {});

  return response.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get<CurrentUserResponse>(
    API_ENDPOINTS.currentUser,
  );

  return response.data;
}

export async function logoutUser() {
  await apiClient.post<unknown>(API_ENDPOINTS.logoutUser, "", {
    headers: {
      accept: "*/*",
      "Content-Type": "application/json",
    },
  });
}

export async function verifyResetPasswordEmail(
  payload: VerifyResetPasswordEmailRequest,
) {
  const response = await apiClient.post<LoginMessageResponse | string>(
    API_ENDPOINTS.verifyResetPasswordEmail,
    payload,
  );

  return response.data;
}

export async function resetPassword(payload: ResetPasswordRequest) {
  const response = await apiClient.post<LoginMessageResponse | string>(
    API_ENDPOINTS.resetPassword,
    payload,
  );

  return response.data;
}
