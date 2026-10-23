//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useSyncExternalStore } from "react";

import {
  getActiveRequestCount,
  subscribeToActiveRequestCount,
} from "@/services/requestTracker";

function useActiveRequestCount() {
  return useSyncExternalStore(
    subscribeToActiveRequestCount,
    getActiveRequestCount,
    getActiveRequestCount,
  );
}

export default function PageLoader() {
  const activeRequestCount = useActiveRequestCount();

  if (activeRequestCount <= 0) {
    return null;
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      data-qaautomationid="page-loader"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(17,24,39,0.38)] px-6 backdrop-blur-[2px]"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white/90 shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#d5e5f1] border-t-[#01579b]" />
      </div>
    </div>
  );
}
