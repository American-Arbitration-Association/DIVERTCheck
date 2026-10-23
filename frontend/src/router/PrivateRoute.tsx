//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { isFrontendAuthBypassEnabled } from "@/config/auth";
import { useAuth } from "@/context/useAuth";
import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function PrivateRoute() {
  const { isAuthenticated, isAuthReady } = useAuth();
  const location = useLocation();

  if (isFrontendAuthBypassEnabled) {
    return <Outlet />;
  }

  if (!isAuthReady) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
