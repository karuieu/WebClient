"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

const components: Components = {
  h1: ({ children }) => <h1 className="mb-3 mt-8 text-[1.5rem] font-medium leading-tight tracking-[-0.025em] first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-7 text-[1.25rem] font-medium leading-snug tracking-[-0.02em] first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-6 text-[1.0625rem] font-medium tracking-[-0.015em] first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-5 font-medium first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-3.5 list-disc space-y-1.5 pl-5 marker:text-subtle">{children}</ul>,
  ol: ({ children }) => <ol className="my-3.5 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-[0.85em] marker:text-muted">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-line-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-fg"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-line-strong pl-4 text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-7 border-line" />,
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-2xl border border-line">
      <table className="w-full border-collapse text-left text-[14px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-line px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-muted">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-line px-4 py-2.5 align-top [tr:last-child_&]:border-b-0">{children}</td>,
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? "");
    const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
    if (lang || text.includes("\n")) return <CodeBlock language={lang} code={text.replace(/\n$/, "")} />;
    return <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.86em]">{children}</code>;
  },
};

export const Markdown = React.memo(function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
});
