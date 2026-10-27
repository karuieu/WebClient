"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cx } from "@/lib/ui/cx";
import { Plus } from "./icons";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors duration-200 disabled:cursor-default disabled:opacity-40",
        checked ? "bg-inverse" : "bg-surface-2 ring-1 ring-inset ring-line-strong",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
        className={cx("size-5 rounded-full shadow-soft", checked ? "ml-auto bg-on-inverse" : "bg-elevated")}
      />
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 items-center rounded-full ring-1 ring-inset ring-line-strong">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:text-fg disabled:cursor-default disabled:opacity-30"
      >
        <span className="h-px w-3 bg-current" />
      </button>
      <span aria-live="polite" className="min-w-8 text-center font-mono text-[13px] tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:text-fg disabled:cursor-default disabled:opacity-30"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
