"use client";

import * as React from "react";
import { Button } from "./Button";
import { Check, Copy, Download } from "./icons";

export function RecoveryPhrase({ words }: { words: string[] }) {
  const [copied, setCopied] = React.useState(false);
  const text = words.join(" ");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

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
      <ol className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-2xl border border-line bg-surface px-5 py-4 sm:grid-cols-3">
        {words.map((w, i) => (
          <li key={i} className="flex items-baseline gap-2.5 font-mono text-[14px]">
            <span className="w-5 text-right text-[11px] text-subtle tabular-nums">{i + 1}</span>
            {w}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
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
