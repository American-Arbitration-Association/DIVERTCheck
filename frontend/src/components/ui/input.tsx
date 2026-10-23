//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<"input">
>(({ className, type = "text", ...props }, ref) => {
  const isInvalid =
    props["aria-invalid"] === true || props["aria-invalid"] === "true";

  return (
    <input
      type={type}
      className={cn(
        "flex  h-11 w-[349px] rounded-lg border bg-white px-3 py-2 text-sm text-[#272423] outline-none transition-[border-color,box-shadow] placeholder:text-[#78716C] disabled:cursor-not-allowed disabled:opacity-50",
        isInvalid
          ? "border-[#ef2b2a] focus:border-[#ef2b2a] focus:shadow-[0_0_0_1px_rgba(239,43,42,0.16)]"
          : "border-[#C1BAB8] focus:border-[#01579b] focus:shadow-[0_0_0_1px_rgba(1,87,155,0.12)]",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
