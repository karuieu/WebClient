"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle } from "@/components/kit/icons";

export function FormAlert({ message }: { message?: string | null }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          ref={ref}
          tabIndex={-1}
          role="alert"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="flex items-start gap-2.5 rounded-2xl border border-danger/40 bg-danger/[0.06] px-4 py-3 text-sm leading-snug text-fg outline-none"
        >
          <AlertCircle className="mt-px text-danger" />
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PendingStatus({ text }: { text?: string | null }) {
  return (
    <p aria-live="polite" className="flex min-h-5 items-center justify-center gap-2 font-mono text-xs text-muted">
      <AnimatePresence mode="wait" initial={false}>
        {text && (
          <motion.span
            key={text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="flex items-center gap-2"
          >
            <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg" />
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </p>
  );
}
