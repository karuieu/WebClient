"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check, X } from "@/components/kit/icons";

interface Toast {
  id: string;
  type: "success" | "info" | "error";
  message: string;
}

interface ToastContextType {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const toastSeqRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: Toast["type"], message: string, duration: number) => {
    // Use a counter: Date.now() collisions would overwrite toast IDs and their timers.
    toastSeqRef.current += 1;
    const id = `toast-${toastSeqRef.current}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      dismissToast(id);
    }, duration);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  const showError = useCallback((message: string) => showToast("error", message, 5000), [showToast]);
  const showSuccess = useCallback((message: string) => showToast("success", message, 3000), [showToast]);
  const showInfo = useCallback((message: string) => showToast("info", message, 3000), [showToast]);

  const renderToast = (toast: Toast) => (
    <motion.div
      key={toast.id}
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-line bg-elevated py-3 pl-4 pr-2 text-fg shadow-soft sm:w-[22rem]"
    >
      <span
        aria-hidden
        className={`mt-px grid size-5 shrink-0 place-items-center rounded-full ${
          toast.type === "error" ? "bg-danger text-on-danger" : toast.type === "success" ? "bg-inverse text-on-inverse" : "border border-line-strong text-muted"
        }`}
      >
        {toast.type === "error" ? <AlertCircle className="size-3" /> : toast.type === "success" ? <Check className="size-3" /> : <span className="size-1 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1 text-pretty text-[13.5px] leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        className="-my-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );

  const errors = toasts.filter((t) => t.type === "error");
  const notices = toasts.filter((t) => t.type !== "error");

  return (
    <ToastContext.Provider value={{ showError, showSuccess, showInfo }}>
      {children}
      {/*
        Keep assertive and polite live regions mounted so screen readers announce updates.
        Errors render above other notices regardless of arrival order.
      */}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        <div role="alert" aria-live="assertive" className="flex w-full flex-col items-center gap-2 sm:items-end">
          <AnimatePresence initial={false}>{errors.map(renderToast)}</AnimatePresence>
        </div>
        <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2 sm:items-end">
          <AnimatePresence initial={false}>{notices.map(renderToast)}</AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
