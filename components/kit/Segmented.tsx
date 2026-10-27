"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cx } from "@/lib/ui/cx";

export type SegmentedOption<T extends string> = { value: T; label: string; disabled?: boolean };

export function Segmented<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  id: string;
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const groupRef = React.useRef<HTMLDivElement>(null);
  const [pill, setPill] = React.useState<{ x: number; width: number } | null>(null);

  // Re-measure when the options change too: another model's levels resize the buttons while the value can stay
  // (Off exists for GLM and Qwen), and the group keeps its width, so the observer doesn't fire.
  const layout = options.map((o) => `${o.value}:${o.label}`).join("|");

  // Measure button offsets within the group; shared layoutId positions drift inside animated dialogs.
  React.useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const measure = () => {
      const active = group.querySelector<HTMLElement>('[aria-checked="true"]');
      setPill(active ? { x: active.offsetLeft, width: active.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [value, layout]);

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      aria-label={label}
      className={cx("relative flex rounded-full bg-surface p-1", className)}
    >
      {pill && (
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={pill}
          transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          className="absolute inset-y-1 left-0 rounded-full bg-elevated shadow-soft ring-1 ring-line"
        />
      )}
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative flex-1 cursor-pointer whitespace-nowrap rounded-full transition-colors duration-150 disabled:cursor-default disabled:opacity-45 disabled:hover:text-muted",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-[13px]",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
