"use client";

import * as React from "react";
import { cx } from "@/lib/ui/cx";

export function InfoHint({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const root = React.useRef<HTMLDetailsElement>(null);

  React.useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (root.current?.open && !root.current.contains(event.target as Node)) root.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details
      ref={root}
      className={cx("z-50 inline-flex shrink-0 select-none", className)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}
    >
      <summary
        aria-label={label}
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-full border border-line-strong text-[12px] font-medium">?</span>
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2.5rem))] cursor-default rounded-xl border border-line bg-elevated p-4 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal text-muted shadow-soft">
        {children}
      </div>
    </details>
  );
}
