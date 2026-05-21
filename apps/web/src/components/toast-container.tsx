"use client";

import { useToast } from "@/app/toast-provider";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toastViewport" aria-live="polite" aria-atomic="true">
      <div className="toastStack">
        {toasts.map((toast) => {
          return (
            <div
              key={toast.id}
              className={`toast toast-${toast.variant}`}
            >
              <div className="toastIcon">
                {toast.variant === "success" && (
                  <CheckCircle2 size={16} aria-hidden="true" />
                )}
                {toast.variant === "error" && (
                  <AlertTriangle size={16} aria-hidden="true" />
                )}
                {toast.variant === "warning" && (
                  <AlertTriangle size={16} aria-hidden="true" />
                )}
                {toast.variant === "info" && (
                  <Info size={16} aria-hidden="true" />
                )}
              </div>
              <p className="toastMessage">{toast.message}</p>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="toastDismiss"
                aria-label="Dismiss"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
