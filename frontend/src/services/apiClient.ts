//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import axios from "axios";

import { isFrontendAuthBypassEnabled } from "@/config/auth";
import { API_BASE_URL } from "./apiConfig";
import { clearPersistedAuthSession } from "./authSession";
import {
  decrementActiveRequestCount,
  incrementActiveRequestCount,
} from "./requestTracker";

declare module "axios" {
  interface AxiosRequestConfig {
    skipRequestTracking?: boolean;
  }
}

const AUTH_TOKEN_KEY = "divertcheck-auth-token";

function isAuthenticationRequest(url?: string) {
  if (!url) {
    return false;
  }

  return (
    url.includes("/Auth/login") ||
    url.includes("/Auth/logout") ||
    url.includes("/Auth/forgot-password") ||
    url.includes("/Auth/reset-password/verify-email") ||
    url.includes("/Auth/reset-password")
  );
}

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }

  window.location.replace("/login");
}

function readAuthToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getAuthToken() {
  return readAuthToken();
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    accept: "text/plain",
    "Content-Type": "application/json",
  },
});

const apiClientGlobal = globalThis as typeof globalThis & {
  __divertCheckApiClientInterceptorsRegistered?: boolean;
  __divertCheckUnauthorizedRedirectInProgress?: boolean;
};

if (!apiClientGlobal.__divertCheckApiClientInterceptorsRegistered) {
  apiClient.interceptors.request.use((config) => {
    if (!config.skipRequestTracking) {
      incrementActiveRequestCount();
    }
    const token = readAuthToken();

    if (token) {
      config.headers = config.headers ?? {};

      if (typeof config.headers.set === "function") {
        config.headers.set("Authorization", `Bearer ${token}`);
      } else {
        (config.headers as Record<string, string>).Authorization =
          `Bearer ${token}`;
      }
    }

    return config;
  });

  apiClient.interceptors.response.use(
    (response) => {
      if (!response.config.skipRequestTracking) {
        decrementActiveRequestCount();
      }
      return response;
    },
    (error: unknown) => {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const requestConfig = axiosError?.config;

      if (!requestConfig?.skipRequestTracking) {
        decrementActiveRequestCount();
      }

      if (
        axiosError &&
        axiosError.response?.status === 401 &&
        !isFrontendAuthBypassEnabled &&
        !isAuthenticationRequest(requestConfig?.url) &&
        !apiClientGlobal.__divertCheckUnauthorizedRedirectInProgress
      ) {
        apiClientGlobal.__divertCheckUnauthorizedRedirectInProgress = true;
        clearPersistedAuthSession();
        redirectToLogin();
      }

      return Promise.reject(
        error instanceof Error ? error : new Error("API request failed."),
      );
    },
  );

  apiClientGlobal.__divertCheckApiClientInterceptorsRegistered = true;
}
