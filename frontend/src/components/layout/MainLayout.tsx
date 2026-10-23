//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Outlet, useLocation } from "react-router-dom";
import Header from "../common/Header/Header";
import Navbar from "../Navbar";

export default function MainLayout() {
  const { pathname } = useLocation();
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";
  const isLoggedIn = !isAuthRoute;

  return (
    <div data-qaautomationid="main-layout">
      <Header isLoggedIn={isLoggedIn} />
      {isLoggedIn && (
        <div className="px-[32px] py-3">
          <Navbar />{" "}
        </div>
      )}
      <Outlet />
    </div>
  );
}
