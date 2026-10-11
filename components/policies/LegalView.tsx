"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "motion/react";
import { Label } from "@/components/kit/Frame";
import { ChevronDown } from "@/components/kit/icons";
import { Logo } from "@/components/kit/Logo";
import { SiteFooter } from "@/components/kit/SiteFooter";
import { ThemeToggle } from "@/components/kit/ThemeToggle";
import { cx } from "@/lib/cx";

export type LegalLang = "pl" | "en";

type Section = { id: string; index: string | null; title: string; body: string };

const SUMMARY = /^(W skrócie|In short|Summary)$/i;

const copy = {
  pl: { label: "Dokumenty", updated: "Ostatnia aktualizacja", contents: "Spis treści", other: "English", top: "Na górę" },
  en: { label: "Legal", updated: "Last updated", contents: "Contents", other: "Polski", top: "Back to top" },
} as const;

export function parseLegal(markdown: string) {
  const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim() ?? "";
  const updated = /^\*\*(?:Ostatnia aktualizacja|Last updated):\*\*\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
  const body = markdown
    .replace(/^# .+$/m, "")
    .replace(/^\*\*(?:Ostatnia aktualizacja|Last updated):\*\*.*$/m, "")
    .replace(/^\s*---\s*$/m, "");

  const sections: Section[] = [];
  const [intro, ...chunks] = body.split(/^## /m);
  let n = 0;
  for (const chunk of chunks) {
    const [head, ...rest] = chunk.split("\n");
    const m = /^(\d+)\.\s+(.+)$/.exec(head.trim());
    const summary = !m && SUMMARY.test(head.trim());
    const num = m ? Number(m[1]) : summary ? 0 : ++n;
    sections.push({
      id: summary ? "summary" : `section-${num}`,
      index: summary ? null : String(num).padStart(2, "0"),
      title: m ? m[2] : head.trim(),
      body: rest.join("\n").trim(),
    });
  }
  return { title, updated, intro: intro.trim(), sections };
}

const md: Components = {
  h3: ({ children }) => <h3 className="mb-3 mt-9 text-[1.0625rem] font-medium tracking-[-0.015em] first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-6 font-medium">{children}</h4>,
  p: ({ children }) => <p className="my-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-5 marker:text-subtle">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-5 marker:font-mono marker:text-[0.85em] marker:text-muted">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  a: ({ href, children }) => {
    const external = href?.startsWith("http");
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="text-fg underline decoration-line-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-fg"
      >
        {children}
      </a>
    );
  },
  code: ({ children }) => <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.86em] text-fg">{children}</code>,
  blockquote: ({ children }) => <blockquote className="my-5 border-l-2 border-line-strong pl-4">{children}</blockquote>,
  hr: () => null,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[32rem] border-collapse text-left text-[14px] leading-relaxed">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-line px-4 py-3 align-bottom font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-muted">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-line px-4 py-3 align-top text-fg/90 [tr:last-child_&]:border-b-0">{children}</td>,
};

function Prose({ children }: { children: string }) {
  return (
    <div className="text-pretty text-[1rem] leading-[1.75] text-muted">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = React.useState<string | null>(ids[0] ?? null);
  const pinned = React.useRef(false);

  React.useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        if (pinned.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    const release = () => (pinned.current = false);
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", release);
    return () => {
      io.disconnect();
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", release);
    };
  }, [ids]);

  const pick = React.useCallback((id: string) => {
    pinned.current = true;
    setActive(id);
  }, []);

  return [active, pick] as const;
}

function Toc({ sections, active, onPick }: { sections: Section[]; active: string | null; onPick: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {sections.map((s) => {
        const on = s.id === active;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={() => onPick(s.id)}
              aria-current={on ? "location" : undefined}
              className={cx(
                "relative flex items-baseline gap-3 rounded-xl px-3 py-2 text-[13.5px] leading-snug tracking-[-0.01em] transition-colors duration-150",
                on ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {on && (
                <motion.span
                  layoutId="legal-toc"
                  transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  className="absolute inset-0 rounded-xl bg-surface"
                />
              )}
              <span className="relative w-5 shrink-0 font-mono text-[11px] text-subtle">{s.index ?? "—"}</span>
              <span className="relative">{s.title}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function LegalView({
  markdown,
  lang,
  otherHref,
  label,
  actions,
}: {
  markdown: string;
  lang: LegalLang;
  otherHref?: string | null;
  label?: string;
  actions?: React.ReactNode;
}) {
  const t = copy[lang];
  const doc = React.useMemo(() => parseLegal(markdown), [markdown]);
  const chapters = React.useMemo(() => doc.sections.filter((s) => s.id !== "summary"), [doc.sections]);
  const ids = React.useMemo(() => chapters.map((s) => s.id), [chapters]);
  const [active, pick] = useActiveSection(ids);
  const [tocOpen, setTocOpen] = React.useState(false);

  return (
    <div lang={lang} className="flex min-h-dvh flex-col scroll-smooth bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-inverse focus:px-4 focus:py-2 focus:text-sm focus:text-on-inverse"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-nav backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-[72rem] items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Karui home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {otherHref && (
              <Link
                href={otherHref}
                hrefLang={lang === "pl" ? "en" : "pl"}
                className="flex h-9 items-center rounded-full px-3.5 font-mono text-[12px] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
              >
                {t.other}
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[72rem] flex-1 px-5 pb-24 pt-16 sm:px-8 md:pt-20">
        <div className="max-w-[46rem] lg:ml-[17rem]">
          <Label>{label ?? t.label}</Label>
          <h1 className="text-title mt-5 text-balance">{doc.title}</h1>
          {doc.updated && (
            <p className="mt-4 font-mono text-[12px] text-muted">
              {t.updated}: <span className="text-fg/80">{doc.updated}</span>
            </p>
          )}
          {lang === "en" && otherHref && (
            <aside role="note" className="mt-8 rounded-2xl border border-line-strong bg-surface px-5 py-4 text-[14px] leading-relaxed text-muted">
              This is an AI translation of the{" "}
              {otherHref ? (
                <Link href={otherHref} hrefLang="pl" className="text-fg underline decoration-line-strong underline-offset-[3px] hover:decoration-fg">
                  Polish original
                </Link>
              ) : (
                "Polish original"
              )}
              , here so you can read it in one place. It isn&apos;t legally binding. Only the Polish version is.
            </aside>
          )}
          {doc.intro && (
            <div className="mt-6 max-w-[40rem] [&_p]:text-[1.0625rem] [&_p]:text-muted">
              <Prose>{doc.intro}</Prose>
            </div>
          )}
          {actions && <div className="mt-10 flex flex-wrap gap-3">{actions}</div>}
        </div>

        {chapters.length > 0 && (
          <div className="mt-12 lg:grid lg:grid-cols-[15rem_minmax(0,46rem)] lg:gap-8">
            <nav aria-label={t.contents} className="hidden lg:block">
              <div className="sticky top-24">
                <p className="text-label mb-3 px-3 text-muted">{t.contents}</p>
                <Toc sections={chapters} active={active} onPick={pick} />
              </div>
            </nav>

            <div className="mb-10 rounded-2xl border border-line lg:hidden">
              <button
                type="button"
                aria-expanded={tocOpen}
                onClick={() => setTocOpen((o) => !o)}
                className="flex h-12 w-full cursor-pointer items-center justify-between px-4 text-[14px] font-medium"
              >
                {t.contents}
                <ChevronDown className={cx("size-4 text-muted transition-transform duration-300", tocOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {tocOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-line p-1.5">
                      <Toc
                        sections={chapters}
                        active={active}
                        onPick={(id) => {
                          pick(id);
                          setTocOpen(false);
                        }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <article className="min-w-0">
              {chapters.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-line pt-10 [&:not(:first-child)]:mt-14 first:border-t-0 first:pt-0">
                  {s.index && <p className="text-label text-muted">[{s.index}]</p>}
                  <h2 className="mt-3 text-[1.5rem] font-medium leading-tight tracking-[-0.025em] text-balance">{s.title}</h2>
                  <div className="mt-6">
                    <Prose>{s.body}</Prose>
                  </div>
                </section>
              ))}
              <div className="mt-16 border-t border-line pt-6">
                <a href="#main" className="font-mono text-[12px] text-muted hover:text-fg">
                  ↑ {t.top}
                </a>
              </div>
            </article>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
