"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy } from "@/components/kit/icons";

const LANGUAGES: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  cpp: "C++",
  c: "C",
  cs: "C#",
  csharp: "C#",
  sh: "Shell",
  bash: "Shell",
  shell: "Shell",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  yaml: "YAML",
  md: "Markdown",
};

const quiet = { color: "var(--muted)" };
const keyword = { color: "var(--code-keyword)", fontWeight: "var(--code-weight)" as React.CSSProperties["fontWeight"] };
const string = { color: "var(--code-string)" };
const number = { color: "var(--code-number)" };
const fn = { color: "var(--code-function)" };
const type = { color: "var(--code-type)" };
const comment = { color: "var(--code-comment)", fontStyle: "italic" };

export const codeTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: "var(--fg)", background: "none", fontFamily: "inherit" },
  'pre[class*="language-"]': { color: "var(--fg)", background: "none", margin: 0, padding: 0, overflow: "auto" },
  comment,
  prolog: comment,
  doctype: comment,
  cdata: comment,
  punctuation: quiet,
  operator: quiet,
  string,
  char: string,
  "attr-value": string,
  regex: string,
  "template-string": string,
  url: string,
  keyword,
  important: keyword,
  atrule: keyword,
  tag: keyword,
  builtin: type,
  "class-name": type,
  "attr-name": fn,
  property: fn,
  function: fn,
  number,
  boolean: number,
  constant: number,
  inserted: { color: "var(--ok)" },
  deleted: { color: "var(--danger)" },
};

export function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = React.useState(false);
  const label = language ? (LANGUAGES[language.toLowerCase()] ?? language) : "Code";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex h-10 items-center justify-between border-b border-line pl-4 pr-1.5">
        <span className="text-label text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "done" : "copy"}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              className="grid place-items-center"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </motion.span>
          </AnimatePresence>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="px-4 py-3.5 font-mono text-[13px] leading-[1.7]">
        <SyntaxHighlighter language={language} style={codeTheme} PreTag="div" wrapLongLines={false}>
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
