//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { isFrontendAuthBypassEnabled } from "@/config/auth";
import { useAuth } from "@/context/useAuth";
import { Navigate, Outlet } from "react-router-dom";

export default function PublicRoute() {
  const { isAuthenticated, isAuthReady } = useAuth();

  if (isFrontendAuthBypassEnabled) {
    return <Navigate to="/upload-case" replace />;
  }

  if (!isAuthReady) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/upload-case" replace />;
  }

  return <Outlet />;
}
