//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import ToastComponent from "@/components/ToastNotifications/ToastComponent";
import { toast } from "sonner";

type ToastType = "error" | "success" | "info";

export function showValidationToast(
  type: ToastType,
  title: string,
  description = "",
  duration = 4000,
) {
  toast.dismiss();
  toast.custom(
    (id) => (
      <ToastComponent
        id={id}
        type={type}
        title={title}
        description={description}
        showCloseButton={false}
        compact
      />
    ),
    {
      closeButton: false,
      duration,
    },
  );
}
