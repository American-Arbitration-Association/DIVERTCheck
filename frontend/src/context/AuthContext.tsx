//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getAuthToken,
  getCurrentUser,
  logoutUser,
  setAuthToken,
  type CurrentUserResponse,
} from "@/services";
import {
  clearPersistedAuthSession,
  persistUser,
  readStoredUser,
} from "@/services/authSession";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(
    () => (getAuthToken() ? readStoredUser() : null),
  );
  const [isResolvingUser, setIsResolvingUser] = useState(
    () => Boolean(getAuthToken()) && !readStoredUser(),
  );
  const isAuthenticated = Boolean(getAuthToken() && currentUser);
  const isAuthReady = !getAuthToken() || isAuthenticated || !isResolvingUser;

  useEffect(() => {
    const token = getAuthToken();

    if (!token) {
      clearPersistedAuthSession();
      return;
    }

    if (currentUser) {
      return;
    }

    let isMounted = true;

    void getCurrentUser()
      .then((user) => {
        if (!isMounted) {
          return;
        }

        setCurrentUser(user);
        persistUser(user);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        clearPersistedAuthSession();
        setCurrentUser(null);
      })
      .finally(() => {
        if (isMounted) {
          setIsResolvingUser(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isAuthenticated,
      isAuthReady,
      login: async (payload) => {
        const normalizedToken = payload.accessToken.trim();
        const nextUser: CurrentUserResponse = {
          userId: payload.user.userId,
          email: payload.user.email,
          roleCode: payload.user.roleCode,
          roleIndCode: payload.user.roleIndCode,
          lastLoginDttm: payload.user.lastLoginDttm,
        };

        setAuthToken(normalizedToken);

        try {
          const user = await getCurrentUser();
          setCurrentUser(user);
          persistUser(user);
        } catch {
          setCurrentUser(nextUser);
          persistUser(nextUser);
        } finally {
          setIsResolvingUser(false);
        }
      },
      logout: async () => {
        try {
          await logoutUser();
        } catch {
          // Client cleanup should still happen if the server logout call fails.
        } finally {
          clearPersistedAuthSession();
          setCurrentUser(null);
          setIsResolvingUser(false);
        }
      },
    }),
    [currentUser, isAuthenticated, isAuthReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
