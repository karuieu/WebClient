"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Label } from "@/components/kit/Frame";
import { ArrowLeft } from "@/components/kit/icons";
import { Logo } from "@/components/kit/Logo";
import { FormAlert } from "@/components/auth/FormAlert";
import { cx } from "@/lib/cx";

export function OnboardingShell({
  step,
  total,
  direction,
  label,
  title,
  lead,
  canContinue = true,
  continueLabel = "Continue",
  saving,
  error,
  skipLabel,
  onBack,
  onNext,
  onSkip,
  children,
}: {
  step: number;
  total: number;
  direction: 1 | -1;
  label: string;
  title: string;
  lead?: React.ReactNode;
  canContinue?: boolean;
  continueLabel?: string;
  saving?: boolean;
  error?: string | null;
  skipLabel?: string;
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const offset = reduce ? 0 : 40 * direction;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3" aria-label={`Step ${step} of ${total}`}>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {String(step).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className="relative h-1 w-5 overflow-hidden rounded-full bg-line-strong sm:w-7">
                <motion.span
                  initial={false}
                  animate={{ x: i < step ? "0%" : "-101%" }}
                  transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                  className="absolute inset-0 rounded-full bg-fg"
                />
              </span>
            ))}
          </span>
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col items-center px-5 pb-10 pt-[10vh] sm:px-8">
        <form
          className="flex w-full max-w-[34rem] flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (canContinue && !saving) onNext();
          }}
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -offset, transition: { duration: 0.18 } }}
              transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            >
              <Label index={String(step).padStart(2, "0")}>{label}</Label>
              <h1 className="text-title mt-6 text-balance">{title}</h1>
              {lead && <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">{lead}</p>}
              <div className="mt-10">{children}</div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-6">
            <FormAlert message={error} />
          </div>

          <div className="mt-10 flex items-center gap-3 border-t border-line pt-6">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex h-12 cursor-pointer items-center gap-2 rounded-full pl-3 pr-5 text-[0.9375rem] font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
              >
                <ArrowLeft />
                Back
              </button>
            ) : (
              <span />
            )}
            <div className="ml-auto flex items-center gap-2">
              {onSkip && (
                <Button variant="ghost" size="lg" onClick={onSkip} className="text-muted">
                  {skipLabel ?? "Skip"}
                </Button>
              )}
              <Button type="submit" size="lg" arrow loading={saving} disabled={!canContinue} className={cx("min-w-36")}>
                {continueLabel}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

export function ChoiceCards<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; description: React.ReactNode; meta?: string; badge?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-3">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex w-full cursor-pointer items-start gap-4 rounded-2xl border bg-elevated p-5 text-left transition-[border-color,box-shadow] duration-200",
              active ? "border-fg/50 shadow-soft" : "border-line hover:border-line-strong",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-medium tracking-[-0.015em]">{o.title}</span>
                {o.badge && (
                  <span className="rounded-full border border-line-strong px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                    {o.badge}
                  </span>
                )}
              </span>
              {o.meta && <span className="mt-1 block font-mono text-[11px] text-muted">{o.meta}</span>}
              <span className="mt-2 block text-pretty text-[13.5px] leading-relaxed text-muted">{o.description}</span>
            </span>
            <span
              aria-hidden="true"
              className={cx(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-150",
                active ? "border-inverse bg-inverse" : "border-line-strong",
              )}
            >
              <motion.span
                initial={false}
                animate={{ scale: active ? 1 : 0 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
                className="size-2 rounded-full bg-on-inverse"
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function BigInput(props: React.ComponentProps<"input"> & { label: string }) {
  const { label, className, ...rest } = props;
  return (
    <div className={cx("rounded-[22px] border border-line-strong bg-elevated px-5 shadow-soft transition-[border-color] duration-200 focus-within:border-fg/40", className)}>
      <label className="sr-only" htmlFor={rest.id}>
        {label}
      </label>
      <input
        data-focus="within"
        className="h-16 w-full bg-transparent text-[1.375rem] tracking-[-0.02em] outline-none placeholder:text-subtle"
        {...rest}
      />
    </div>
  );
}
