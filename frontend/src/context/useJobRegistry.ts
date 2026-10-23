//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useContext } from "react";

import { JobRegistryContext } from "./job-registry-context";

export function useJobRegistry() {
  const context = useContext(JobRegistryContext);

  if (!context) {
    throw new Error(
      "useJobRegistry must be used within a JobRegistryProvider.",
    );
  }

  return context;
}
