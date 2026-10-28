"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "@/lib/ui/cx";
import { remarkSubSup } from "@/lib/ui/remarkSubSup";
import { CodeBlock } from "./CodeBlock";

/** Scrolls sideways when wider than the answer and fades the right edge while more is hidden there. */
function ScrollableTable({ children }: { children: React.ReactNode }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [hasMoreRight, setHasMoreRight] = React.useState(false);

  const updateHint = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) setHasMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateHint();
    // The table grows while the answer streams, so watch it as well as the viewport.
    const observer = new ResizeObserver(updateHint);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [updateHint]);

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-line">
      <div
        ref={scrollRef}
        onScroll={updateHint}
        className={cx("overflow-x-auto", hasMoreRight && "[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)]")}
      >
        <table className="w-full border-collapse text-left text-[14px] [overflow-wrap:normal]">{children}</table>
      </div>
    </div>
  );
}

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
  table: ({ children }) => <ScrollableTable>{children}</ScrollableTable>,
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  th: ({ children }) => (
    <th className="whitespace-nowrap border-b border-line px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-muted">
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
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkSubSup]} components={components}>
      {children}
    </ReactMarkdown>
  );
});
