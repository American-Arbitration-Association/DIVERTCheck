//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { clearAuthToken } from "./apiClient";
import type { CurrentUserResponse } from "./authentication";

const AUTH_USER_STORAGE_KEY = "divertcheck-auth-user";

export function readStoredUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as CurrentUserResponse;
  } catch {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return null;
  }
}

export function persistUser(user: CurrentUserResponse | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearPersistedAuthSession() {
  clearAuthToken();
  persistUser(null);
}
