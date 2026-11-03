"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { cx } from "@/lib/ui/cx";

export type InstructionsSettingsProps = {
  instructions: string;
  max: number;
  saving?: boolean;
  onSave: (text: string) => void;
};

export function InstructionsSettings({ instructions, max, saving, onSave }: InstructionsSettingsProps) {
  const [text, setText] = React.useState(instructions);
  React.useEffect(() => setText(instructions), [instructions]);
  const over = text.length > max;

  return (
    <div>
      <label htmlFor="settings-instructions" className="sr-only">
        Custom instructions
      </label>
      <textarea
        id="settings-instructions"
        data-focus="within"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="I'm a product designer in Poznań. Keep answers short, use metric units, and skip the pleasantries."
        className="w-full resize-y rounded-2xl border border-line-strong bg-bg px-4 py-3.5 text-[15px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus:border-fg focus:shadow-[0_0_0_3px_var(--line)]"
      />
      <div className="mt-3 flex items-center justify-between gap-3 pl-1">
        <span className={cx("font-mono text-[11.5px] tabular-nums", over ? "text-danger" : "text-muted")} aria-live="polite">
          {text.length} / {max}
        </span>
        <Button loading={saving} disabled={text === instructions || over} onClick={() => onSave(text.trim())}>
          Save
        </Button>
      </div>
    </div>
  );
}
