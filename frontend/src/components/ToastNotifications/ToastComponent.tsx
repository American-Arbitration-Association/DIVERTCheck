//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { IconAlertCircle, IconCircleCheck, IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import "./ToastNotifications.css";

export interface IToastNotificationProps {
  id?: string | number;
  type: "info" | "error" | "success";
  title: string;
  description: ReactNode;
  showCloseButton?: boolean;
  compact?: boolean;
}
export default function ToastComponent({
  id,
  type,
  title,
  description,
  showCloseButton = true,
  compact = false,
}: IToastNotificationProps) {
  const isSuccess = type === "success";

  return (
    <div
      className={`toast toast--${type}${compact ? " toast--compact" : ""}`}
      role="status"
      aria-live={isSuccess ? "polite" : "assertive"}
    >
      <div className={`toast__icon toast__icon--${type}`}>
        {isSuccess ? (
          <IconCircleCheck size={16} />
        ) : (
          <IconAlertCircle size={16} />
        )}
      </div>
      <div className="toast__content">
        {title ? <span className="title">{title}</span> : null}
        {description ? <div className="description">{description}</div> : null}
      </div>
      {showCloseButton ? (
        <button
          type="button"
          className="toast__close"
          onClick={() => toast.dismiss(id)}
          aria-label="Close notification"
        >
          <IconX size={14} />
        </button>
      ) : null}
    </div>
  );
}
