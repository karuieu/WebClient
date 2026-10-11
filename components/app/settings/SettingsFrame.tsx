"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ChevronRight, X } from "@/components/kit/icons";
import { cx } from "@/lib/cx";
import { useMounted } from "@/components/kit/useMounted";

export type FrameTab<T extends string> = { id: T; label: string; icon: React.ReactNode; group?: string; danger?: boolean };

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

export function SettingsFrame<T extends string>({
  open,
  title,
  label = title,
  tabs,
  tab,
  onTab,
  onClose,
  sections,
  badges,
}: {
  open: boolean;

  title: string;
  label?: string;
  tabs: readonly FrameTab<T>[];
  tab: T;
  onTab: (t: T) => void;
  onClose: () => void;
  sections: Record<T, React.ReactNode>;
  badges?: Partial<Record<T, string>>;
}) {
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const pillId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const [mobileContent, setMobileContent] = React.useState(false);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  const groups: { title: string; tabs: FrameTab<T>[] }[] = [];
  for (const t of tabs) {
    const name = t.group ?? title;
    const last = groups[groups.length - 1];
    if (last?.title === name) last.tabs.push(t);
    else groups.push({ title: name, tabs: [t] });
  }

  React.useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.focus());
    return () => {
      document.body.style.overflow = prev;
      returnFocus.current?.focus?.();
    };
  }, [open]);

  React.useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const select = (t: T) => {
    onTab(t);
    setMobileContent(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const els = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    if (!els.length) return;
    if (e.shiftKey && document.activeElement === els[0]) {
      e.preventDefault();
      els[els.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === els[els.length - 1]) {
      e.preventDefault();
      els[0].focus();
    }
  };

  const renderTab = (t: FrameTab<T>) => {
    const active = t.id === tab;
    return (
      <li key={t.id}>
        <button
          type="button"
          onClick={() => select(t.id)}
          aria-current={active ? "page" : undefined}
          className={cx(
            "relative flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[14px] tracking-[-0.01em] transition-colors duration-150 sm:h-9 sm:text-[13.5px]",
            active ? "text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg",
            t.danger && !active && "hover:text-danger",
          )}
        >
          {active && (
            <motion.span
              layoutId={pillId}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="absolute inset-0 hidden rounded-xl bg-elevated shadow-soft ring-1 ring-line sm:block"
            />
          )}
          <span className="relative">{t.icon}</span>
          <span className="relative flex-1">{t.label}</span>
          {badges?.[t.id] && (
            <span className="relative rounded-full border border-line-strong px-1.5 py-[3px] font-mono text-[10px] leading-none text-muted">
              {badges[t.id]}
            </span>
          )}
          <ChevronRight className="relative size-3.5 text-subtle sm:hidden" />
        </button>
      </li>
    );
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center font-sans text-fg sm:p-6" onKeyDown={onKeyDown}>
          <motion.div
            key="scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99, transition: { duration: 0.16 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="relative flex h-dvh w-full overflow-hidden bg-bg shadow-soft sm:h-[min(46rem,calc(100dvh-3rem))] sm:max-w-[62rem] sm:rounded-[24px] sm:border sm:border-line"
          >
            <nav
              aria-label={`${label} sections`}
              className={cx(
                "w-full shrink-0 flex-col border-line bg-surface sm:flex sm:w-60 sm:border-r",
                mobileContent ? "hidden" : "flex",
              )}
            >
              {groups.map((g, i) => (
                <React.Fragment key={g.title}>
                  <div className={cx("flex h-16 shrink-0 items-center justify-between gap-2 px-5 sm:px-6", i > 0 && "mt-4")}>
                    <h2 className="text-heading truncate">{g.title}</h2>
                    {i === 0 && (
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label={`Close ${label.toLowerCase()}`}
                        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg sm:hidden"
                      >
                        <X className="size-[18px]" />
                      </button>
                    )}
                  </div>
                  <ul className={cx("flex flex-col gap-0.5 px-3", i === groups.length - 1 && "pb-[max(1rem,env(safe-area-inset-bottom))]")}>
                    {g.tabs.map(renderTab)}
                  </ul>
                </React.Fragment>
              ))}
            </nav>

            <div className={cx("min-w-0 flex-1 flex-col sm:flex", mobileContent ? "flex" : "hidden")}>
              <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-8">
                <button
                  type="button"
                  onClick={() => setMobileContent(false)}
                  aria-label={`All ${label.toLowerCase()}`}
                  className="grid size-9 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface hover:text-fg sm:hidden"
                >
                  <ArrowLeft className="size-[18px]" />
                </button>
                <h2 className="text-heading flex-1">{current.label}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={`Close ${label.toLowerCase()}`}
                  className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
                >
                  <X className="size-[18px]" />
                </button>
              </header>
              <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    className="mx-auto max-w-[42rem] px-5 py-7 sm:px-8 sm:py-8"
                  >
                    {sections[tab]}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
