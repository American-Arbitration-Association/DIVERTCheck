//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/**
 * Local, frontend-only escape hatch for UI work when an API session is not
 * available. Keep this disabled in all shared and deployed environments.
 */
export const isFrontendAuthBypassEnabled =
  import.meta.env.VITE_BYPASS_AUTH === "true";
