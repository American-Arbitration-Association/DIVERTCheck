//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useLocation, useNavigate } from "react-router-dom";

const navItems = [
  { label: "New Review", to: "/upload-case" },
  { label: "All Reviews", to: "/cases" },
  { label: "Configuration", to: "/prompts" },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="rounded-lg bg-muted p-1">
      {navItems.map((item) => (
        <button
          key={item.to}
          type="button"
          className={`w-[196px] rounded-sm font-medium navbar ${location.pathname === item.to ? "bg-[#F7F6F5]" : "bg-muted"}`}
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
