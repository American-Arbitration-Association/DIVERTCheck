//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { isFrontendAuthBypassEnabled } from "@/config/auth";
import { useAuth } from "@/context/useAuth";
import { Navigate, Outlet } from "react-router-dom";

export default function AdminRoute() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.roleCode.trim().toUpperCase() === "ADMIN";

  if (isFrontendAuthBypassEnabled || isAdmin) {
    return <Outlet />;
  }

  return <Navigate to="/upload-case" replace />;
}
