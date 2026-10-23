//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export const PASSWORD_RULES_MESSAGE =
  "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one symbol";

export function isStrongPassword(value: string) {
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}
