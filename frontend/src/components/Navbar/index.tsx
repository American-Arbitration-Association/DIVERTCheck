//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { isFrontendAuthBypassEnabled } from "@/config/auth";
import { useAuth } from "@/context/useAuth";
import { useLocation, useNavigate } from "react-router-dom";

import { toTestIdSegment } from "@/lib/utils";

const navItems = [
  { label: "New Review", to: "/upload-case" },
  { label: "All Reviews", to: "/cases" },
  { label: "Configuration", to: "/prompts", adminOnly: true },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.roleCode.trim().toUpperCase() === "ADMIN";
  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin || isFrontendAuthBypassEnabled,
  );

  return (
    <div className="rounded-lg bg-muted p-1" data-qaautomationid="main-navbar">
      {visibleNavItems.map((item) => (
        <button
          key={item.to}
          type="button"
          className={`w-[196px] rounded-sm font-medium navbar ${location.pathname === item.to ? "bg-[#F7F6F5]" : "bg-muted"}`}
          data-qaautomationid={`main-navbar-item-${toTestIdSegment(item.label)}`}
          onClick={() => {
            void navigate(item.to);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
