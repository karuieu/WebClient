"use client";

import * as React from "react";
import { Button } from "./Button";
import { cx } from "@/lib/cx";
import { Check, Copy, Download, Eye, EyeOff } from "./icons";

export function RecoveryPhrase({ words }: { words: string[] }) {
  const [copied, setCopied] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const hideRef = React.useRef<HTMLButtonElement>(null);
  const text = words.join(" ");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  React.useEffect(() => {
    if (shown) hideRef.current?.focus();
  }, [shown]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([`Karui recovery phrase\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "karui-recovery-phrase.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="relative">
        <ol
          aria-hidden={!shown}
          className={cx(
            "grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-2xl border border-line bg-surface px-5 py-4 transition-[filter] duration-300 sm:grid-cols-3",
            !shown && "select-none blur-md",
          )}
        >
          {words.map((w, i) => (
            <li key={i} className="flex items-baseline gap-2.5 font-mono text-[14px]">
              <span className="w-5 text-right text-[11px] text-subtle tabular-nums">{i + 1}</span>
              {w}
            </li>
          ))}
        </ol>
        {!shown && (
          <button
            type="button"
            onClick={() => setShown(true)}
            className="absolute inset-0 grid cursor-pointer place-items-center rounded-2xl"
          >
            <span className="flex h-9 items-center gap-2 rounded-full border border-line-strong bg-elevated px-4 text-[13.5px] font-medium shadow-soft">
              <Eye className="size-4" />
              Show words
            </span>
          </button>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        {shown && (
          <Button ref={hideRef} variant="secondary" onClick={() => setShown(false)} className="flex-1">
            <EyeOff />
            Hide
          </Button>
        )}
        <Button variant="secondary" onClick={copy} className="flex-1">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="secondary" onClick={download} className="flex-1">
          <Download />
          Download
        </Button>
      </div>
    </div>
  );
}
