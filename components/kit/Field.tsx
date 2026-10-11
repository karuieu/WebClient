"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cx } from "@/lib/cx";
import { AlertCircle, Eye, EyeOff } from "./icons";

type FieldProps = Omit<React.ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  labelAside?: React.ReactNode;
};

export function Field({ id, label, hint, error, labelAside, type = "text", className, ...props }: FieldProps) {
  const [reveal, setReveal] = React.useState(false);
  const isPassword = type === "password";
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium tracking-[-0.01em]">
          {label}
        </label>
        {labelAside}
      </div>

      <div
        className={cx(
          "group/field flex min-h-12 items-center rounded-[16px] border bg-bg transition-[border-color,box-shadow] duration-150",
          "focus-within:shadow-[0_0_0_3px_var(--line)]",
          error ? "border-danger" : "border-line-strong focus-within:border-fg",
        )}
      >
        <input
          id={id}
          data-focus="within"
          type={isPassword && reveal ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          className="h-12 min-w-0 flex-1 rounded-[16px] bg-transparent px-4 text-base tracking-[-0.01em] text-fg outline-none placeholder:text-subtle focus-visible:outline-none"
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="mr-1.5 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-fg active:scale-[0.94]"
          >
            {reveal ? <EyeOff /> : <Eye />}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key="error"
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger"
          >
            <AlertCircle className="mt-px size-3.5" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {hintId && (
        <p id={hintId} className="text-[0.8125rem] leading-snug text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  id,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "id"> & { id: string }) {
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted", className)}>
      <span className="relative mt-[3px] grid size-[18px] shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          className="peer absolute inset-0 cursor-pointer appearance-none rounded-[6px] border border-line-strong bg-bg transition-colors duration-150 checked:border-inverse checked:bg-inverse"
          {...props}
        />
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none relative size-3 scale-50 text-on-inverse opacity-0 transition-[opacity,transform] duration-150 ease-out-soft peer-checked:scale-100 peer-checked:opacity-100"
        >
          <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  className,
  rows = 4,
  ...props
}: Omit<React.ComponentProps<"textarea">, "id"> & { id: string; label: string; hint?: React.ReactNode }) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium tracking-[-0.01em]">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        data-focus="within"
        aria-describedby={hintId}
        className="min-h-24 w-full resize-y rounded-[16px] border border-line-strong bg-bg px-4 py-3 text-[15px] leading-relaxed tracking-[-0.01em] text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus:border-fg focus:shadow-[0_0_0_3px_var(--line)]"
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-[0.8125rem] leading-snug text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
