//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { IconChevronDown, IconChevronUp, IconUser } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/context/useAuth";

export default function Header({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const { currentUser, logout } = useAuth();

  const displayName = getDisplayName(currentUser?.email);
  const roleLabel = getRoleLabel(currentUser?.roleCode);
  const lastLogin = formatLastLogin(currentUser?.lastLoginDttm);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await logout();
    } finally {
      window.location.replace("/login");
    }
  };

  return (
    <div
      className="flex items-center justify-between gap-4 border-b border-[#C4C7C5] px-8 py-4"
      data-qaautomationid="main-header"
    >
      <Link
        to={isLoggedIn ? "/upload-case" : "/login"}
        className="font-suisse text-[20px] font-medium leading-9 tracking-normal text-[#272423] no-underline hover:no-underline"
        aria-label="Go to home page"
        data-qaautomationid="main-header-logo-link"
      >
        DIVERTCheck
      </Link>
      <div className="flex items-center gap-4">
        {isLoggedIn && (
          <>
            <Popover open={isAccountOpen} onOpenChange={setIsAccountOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 gap-2 rounded-[10px] px-3 py-2 text-[#272423] shadow-none hover:bg-transparent"
                  aria-label="Open account menu"
                  data-qaautomationid="main-header-account-menu-button"
                >
                  <IconUser size={18} stroke={1.8} />
                  {isAccountOpen ? (
                    <IconChevronUp size={16} stroke={1.8} />
                  ) : (
                    <IconChevronDown size={16} stroke={1.8} />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-fit max-w-[calc(100vw-2rem)] p-0"
                data-qaautomationid="main-header-account-menu-popover"
              >
                <div className="border-b border-[#e7e2e0]  m-1 p-2 py-2">
                  <p
                    className="text-sm leading-5 text-[#272423]"
                    data-qaautomationid="main-header-account-menu-title"
                  >
                    My Account
                  </p>
                </div>
                <div className="  m-1 p-2 py-1">
                  <p
                    className=" text-sm leading-5  text-[#272423]"
                    data-qaautomationid="main-header-account-display-name"
                  >
                    {displayName}
                  </p>
                  <p
                    className=" text-sm leading-5  text-[#4a4442]"
                    data-qaautomationid="main-header-account-email"
                  >
                    {currentUser?.email ?? ""}
                  </p>

                  <div
                    className="text-sm leading-5 px-4 text-[#4a4442]"
                    data-qaautomationid="main-header-account-details"
                  >
                    <p data-qaautomationid="main-header-account-role">
                      Role: {roleLabel}
                    </p>
                    <p data-qaautomationid="main-header-account-last-login">
                      Last login: {lastLogin.dateLabel} {lastLogin.timeLabel}
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-md border-[#9E9492] px-4 py-2 hover:bg-white"
              data-qaautomationid="main-header-logout-button"
              onClick={() => {
                void handleLogout();
              }}
              disabled={isLoggingOut}
            >
              <span className="font-suisse text-sm font-medium leading-5 text-[#272423]">
                Log Out
              </span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function getDisplayName(email?: string) {
  if (!email) {
    return "My Account";
  }

  const [localPart = ""] = email.split("@");
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`);

  return words.length ? words.join(" ") : email;
}

function getRoleLabel(roleCode?: string) {
  if (!roleCode) {
    return "--";
  }

  return roleCode
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatLastLogin(lastLoginDttm?: string) {
  if (!lastLoginDttm) {
    return {
      dateLabel: "--",
      timeLabel: "",
    };
  }

  const parsedDate = new Date(lastLoginDttm);

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      dateLabel: "--",
      timeLabel: "",
    };
  }

  return {
    dateLabel: parsedDate.toLocaleDateString("en-US"),
    timeLabel: parsedDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}
