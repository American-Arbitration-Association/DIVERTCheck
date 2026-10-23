//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { cn } from "@/lib/utils";

interface FormFieldErrorProps {
  className?: string;
  id?: string;
  message?: string;
}

export default function FormFieldError({
  className,
  id,
  message,
}: FormFieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <p
      id={id}
      className={cn("text-sm leading-3 text-[#cf2a1b]", className)}
      aria-live="polite"
    >
      {message}
    </p>
  );
}
