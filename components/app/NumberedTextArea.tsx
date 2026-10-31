"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { cx } from "@/lib/ui/cx";
import { codeTheme } from "./chat/CodeBlock";

/**
 * Mirror soft-wrapped lines behind the textarea in the same grid cell so line numbers and scrolling stay aligned.
 * With a `language`, the coloured code is one more layer behind a textarea whose own text is transparent.
 */
export function NumberedTextArea({
  value,
  onChange,
  label,
  placeholder,
  spellCheck,
  readOnly,
  language,
}: {
  value: string;
  onChange?: (v: string) => void;
  label: string;
  placeholder?: string;
  spellCheck?: boolean;
  readOnly?: boolean;
  /** A Prism language: the text is coloured like a code block. */
  language?: string;
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
        {language && <CodeColours text={text} gutter={gutter} language={language} value={value} />}
        <textarea
          data-focus="within"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          spellCheck={spellCheck}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          className={cx(
            text,
            "block w-full resize-none overflow-hidden border-0 bg-transparent outline-none placeholder:font-sans placeholder:text-subtle",
            language ? "text-transparent caret-fg" : "text-fg",
          )}
          style={{ paddingLeft: gutter }}
        />
      </div>
    </div>
  );
}

// Same box and wrapping as the textarea, so every coloured character sits under the one typed there.
const CodeColours = React.memo(function CodeColours({ text, gutter, language, value }: { text: string; gutter: string; language: string; value: string }) {
  return (
    <div aria-hidden="true" className={cx(text, "pointer-events-none")} style={{ paddingLeft: gutter }}>
      <SyntaxHighlighter
        language={language}
        style={codeTheme}
        PreTag="div"
        customStyle={{ overflow: "visible", whiteSpace: "inherit", wordBreak: "inherit", overflowWrap: "inherit" }}
        codeTagProps={{ style: { whiteSpace: "inherit", overflowWrap: "inherit" } }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
});
