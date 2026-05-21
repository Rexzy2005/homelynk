'use client';

import { useToast } from '@/app/toast-provider';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed z-50 inset-x-0 bottom-4 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col gap-2 w-full max-w-xs pointer-events-auto">
        {toasts.map((toast) => {
          const bgColor =
            toast.variant === 'success'
              ? 'bg-mint/20 text-teal-dark'
              : toast.variant === 'error'
                ? 'bg-red/20 text-red'
                : toast.variant === 'warning'
                  ? 'bg-amber/20 text-amber'
                  : 'bg-teal/20 text-teal-dark';
          return (
            <div
              key={toast.id}
              className={`${bgColor} rounded-lg p-4 flex items-start gap-3 shadow-lg`}
            >
              <div className="flex-shrink-0 flex h-5 w-5 items-center justify-center">
                {toast.variant === 'success' && (
                  <CheckCircle2 size={16} aria-hidden="true" />
                )}
                {toast.variant === 'error' && (
                  <AlertTriangle size={16} aria-hidden="true" />
                )}
                {toast.variant === 'warning' && (
                  <AlertTriangle size={16} aria-hidden="true" />
                )}
                {toast.variant === 'info' && (
                  <Info size={16} aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 text-sm">
                <p className="whitespace-pre-line">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-2 flex h-5 w-5 items-center justify-center text-muted hover:text-ink"
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