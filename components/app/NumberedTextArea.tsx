"use client";

import * as React from "react";
import { cx } from "@/lib/cx";

/** Mirror soft-wrapped lines behind the textarea in the same grid cell so line numbers and scrolling stay aligned. */
export function NumberedTextArea({
  value,
  onChange,
  label,
  placeholder,
  spellCheck,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  spellCheck?: boolean;
}) {
  const lines = value.split("\n");
  const gutter = `calc(${String(lines.length).length}ch + 1.75rem)`;
  const text = "whitespace-pre-wrap break-words py-3 pr-4 font-mono text-[12.5px] leading-relaxed [tab-size:4]";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto transition-colors duration-150 focus-within:bg-elevated">
      <div className="grid min-h-full grid-cols-1 [&>*]:[grid-area:1/1]">
        <div aria-hidden="true" className="border-r border-line bg-surface-2/40" style={{ width: `calc(${gutter} - 0.625rem)` }} />
        <div aria-hidden="true" className={cx(text, "pointer-events-none text-transparent [counter-reset:line]")} style={{ paddingLeft: gutter }}>
          {lines.map((line, i) => (
            <div
              key={i}
              className="relative [counter-increment:line] before:absolute before:right-full before:top-0 before:mr-3.5 before:font-mono before:text-[11px] before:leading-[calc(12.5px*1.625)] before:text-muted before:content-[counter(line)]"
            >
              {line || "\u200b"}
            </div>
          ))}
        </div>
        <textarea
          data-focus="within"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          spellCheck={spellCheck}
          onChange={(e) => onChange(e.target.value)}
          className={cx(text, "block w-full resize-none overflow-hidden border-0 bg-transparent text-fg outline-none placeholder:font-sans placeholder:text-subtle")}
          style={{ paddingLeft: gutter }}
        />
      </div>
    </div>
  );
}
