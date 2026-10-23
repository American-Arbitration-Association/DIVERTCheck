//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "./index";

export interface RegisterUserRequest {
  email: string;
  password: string;
  roleCode?: string;
}

export interface RegisteredUser {
  userId: number;
  email: string;
  roleCode: string;
  roleIndCode: string;
  lastLoginDttm?: string | null;
}

export type RegisterUserApiResponse =
  | RegisteredUser
  | {
      accessToken?: string;
      user: RegisteredUser;
    };

export interface RegistrationMessageResponse {
  message?: string;
  title?: string;
  detail?: string;
  error?: string;
}

export async function registerUser(payload: RegisterUserRequest) {
  const response = await apiClient.post<
    RegisterUserApiResponse | RegistrationMessageResponse | string
  >(API_ENDPOINTS.registerUser, payload);

  return response.data;
}
