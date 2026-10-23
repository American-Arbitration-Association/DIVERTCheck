//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { createContext } from "react";

import type { CurrentUserResponse, LoginSuccessResponse } from "@/services";

export interface AuthContextValue {
  currentUser: CurrentUserResponse | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  login: (payload: LoginSuccessResponse) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
