"use client";

import * as React from "react";
import { Lock } from "@/components/kit/icons";
import { cx } from "@/lib/cx";

export function Group({
  title,
  footer,
  children,
  className,
}: {
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mt-9 first:mt-0", className)}>
      {title && <h3 className="text-label mb-3 px-1 text-fg/80">{title}</h3>}
      <div className="divide-y divide-line rounded-2xl border border-line bg-elevated">{children}</div>
      {footer && <div className="mt-2.5 px-1 text-[12.5px] leading-relaxed text-muted">{footer}</div>}
    </section>
  );
}

export function Row({
  label,
  description,
  htmlFor,
  control,
  children,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  control?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const descId = React.useId();
  return (
    <div className={cx("px-4 py-3.5", className)}>
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="text-[14.5px] font-medium tracking-[-0.01em]">
              {label}
            </label>
          ) : (
            <p className="text-[14.5px] font-medium tracking-[-0.01em]">{label}</p>
          )}
          {description && (
            <p id={descId} className="mt-0.5 text-pretty text-[13px] leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Encrypted({ children = "Encrypted in your browser" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
      <Lock className="size-3" />
      {children}
    </span>
  );
}

export function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-8 max-w-[34rem] text-pretty text-[14px] leading-relaxed text-muted">{children}</p>;
}
