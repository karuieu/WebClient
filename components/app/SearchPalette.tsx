"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Folder, MessageSquare, Search, X } from "@/components/kit/icons";
import { Spinner } from "@/components/kit/Spinner";
import { useMounted, useNow } from "@/components/kit/useMounted";
import { cx } from "@/lib/cx";
import { standaloneStamp } from "./ChatsView";

export type SearchRange = readonly [number, number];
export type SearchText = { text: string; ranges: SearchRange[] };

export type SearchProjectHit = { id: string; name: SearchText; goal?: SearchText };
export type SearchChatHit = { id: string; title: SearchText; projectName?: string | null; updatedAt: string };
export type SearchMessageHit = { id: string; role: "user" | "assistant"; snippet: SearchText };
export type SearchMessageGroup = { chat: SearchChatHit; hits: SearchMessageHit[]; more: number };

export type SearchTarget =
  | { kind: "project"; id: string }
  | { kind: "chat"; id: string }
  | { kind: "message"; chatId: string; messageId: string };

export type SearchPaletteProps = {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  recent: SearchChatHit[];
  projects: SearchProjectHit[];
  chats: SearchChatHit[];
  messages: SearchMessageGroup[];
  indexing?: { done: number; total: number; paused?: boolean } | null;
  onSelect: (target: SearchTarget) => void;
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

function Marked({ value }: { value: SearchText }) {
  if (!value.ranges.length) return <>{value.text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  value.ranges.forEach(([start, end], i) => {
    if (start > at) out.push(value.text.slice(at, start));
    out.push(
      <mark key={i} className="rounded-[4px] bg-fg/[0.09] px-px font-medium text-fg">
        {value.text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  out.push(value.text.slice(at));
  return <>{out}</>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <li role="presentation" className="text-label px-3 pb-2 pt-4 text-muted first:pt-2">{children}</li>;
}

function Option({
  id,
  active,
  onHover,
  onPick,
  children,
}: {
  id: string;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onPointerMove={onHover}
      onClick={onPick}
      className={cx(
        "flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-100",
        active ? "bg-surface-2" : "hover:bg-surface",
      )}
    >
      {children}
    </li>
  );
}

function ChatLine({ chat, now }: { chat: SearchChatHit; now: Date | null }) {
  return (
    <>
      <MessageSquare className="mt-[3px] size-4 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] tracking-[-0.01em]">
          <Marked value={chat.title} />
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
          {[chat.projectName, now ? standaloneStamp(chat.updatedAt, now) : null].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
}

export function SearchPalette({
  open,
  onClose,
  query,
  onQueryChange,
  recent,
  projects,
  chats,
  messages,
  indexing,
  onSelect,
}: SearchPaletteProps) {
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const now = useNow();
  const baseId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);

  const q = query.trim();
  const targets: SearchTarget[] = q
    ? [
        ...projects.map((p) => ({ kind: "project", id: p.id }) as const),
        ...chats.map((c) => ({ kind: "chat", id: c.id }) as const),
        ...messages.flatMap((g) => g.hits.map((h) => ({ kind: "message", chatId: g.chat.id, messageId: h.id }) as const)),
      ]
    : recent.map((c) => ({ kind: "chat", id: c.id }) as const);

  const [nav, setNav] = React.useState({ query, index: 0 });
  const active = targets.length ? Math.min(nav.query === query ? nav.index : 0, targets.length - 1) : -1;
  const setActive = (index: number) => setNav({ query, index });
  const optionId = (i: number) => `${baseId}-option-${i}`;

  React.useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = prev;
      returnFocus.current?.focus?.();
    };
  }, [open]);

  React.useEffect(() => {
    if (active >= 0) document.getElementById(`${baseId}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, baseId]);

  const pick = (i: number) => {
    const target = targets[i];
    if (target) onSelect(target);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const toggle = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k";
    if (e.key === "Escape" || toggle) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && targets.length) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + targets.length) % targets.length);
    } else if (e.key === "Enter" && active >= 0 && !e.nativeEvent.isComposing) {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Tab") {
      const els = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (els.length < 2) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  let index = 0;
  const option = (children: React.ReactNode, key: string) => {
    const i = index++;
    return (
      <Option key={key} id={optionId(i)} active={i === active} onHover={() => i !== active && setActive(i)} onPick={() => pick(i)}>
        {children}
      </Option>
    );
  };

  const nothing = q && !projects.length && !chats.length && !messages.length;
  const working = indexing && !indexing.paused;

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex justify-center font-sans text-fg sm:items-start sm:px-6 sm:pt-[12vh]" onKeyDown={onKeyDown}>
          <motion.div
            key="scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99, transition: { duration: 0.14 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.34 }}
            className="relative flex h-dvh w-full flex-col bg-elevated pt-[env(safe-area-inset-top)] sm:h-auto sm:max-h-[min(36rem,76vh)] sm:max-w-[40rem] sm:rounded-[22px] sm:border sm:border-line sm:pt-0 sm:shadow-soft"
          >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line pl-5 pr-3">
              <Search className="size-[18px] text-muted" />
              <input
                ref={inputRef}
                data-focus="within"
                type="search"
                role="combobox"
                aria-expanded={targets.length > 0}
                aria-controls={`${baseId}-list`}
                aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search chats and projects"
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.01em] outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    onQueryChange("");
                    inputRef.current?.focus();
                  }}
                  className="grid size-7 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="h-8 cursor-pointer rounded-full px-2.5 text-[14px] text-muted hover:text-fg sm:hidden"
              >
                Cancel
              </button>
              <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">esc</kbd>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {nothing ? (
                <div className="px-6 py-14 text-center">
                  <p className="text-[15px] font-medium tracking-[-0.01em]">Nothing matches “{q}”.</p>
                  <p className="mt-1.5 text-[14px] text-muted">
                    {working ? "Older chats are still being decrypted. They’ll appear here." : "Titles, projects and messages were all searched."}
                  </p>
                </div>
              ) : (
                <ul id={`${baseId}-list`} role="listbox" aria-label="Results">
                  {!q ? (
                    recent.length > 0 && (
                      <>
                        <SectionLabel>Recent</SectionLabel>
                        {recent.map((c) => option(<ChatLine chat={c} now={now} />, `recent-${c.id}`))}
                      </>
                    )
                  ) : (
                    <>
                      {projects.length > 0 && <SectionLabel>Projects</SectionLabel>}
                      {projects.map((p) =>
                        option(
                          <>
                            <Folder className="mt-[3px] size-4 text-muted" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14.5px] tracking-[-0.01em]">
                                <Marked value={p.name} />
                              </span>
                              {p.goal && (
                                <span className="mt-0.5 block truncate text-[13px] text-muted">
                                  <Marked value={p.goal} />
                                </span>
                              )}
                            </span>
                          </>,
                          `project-${p.id}`,
                        ),
                      )}

                      {chats.length > 0 && <SectionLabel>Chats</SectionLabel>}
                      {chats.map((c) => option(<ChatLine chat={c} now={now} />, `chat-${c.id}`))}

                      {messages.length > 0 && <SectionLabel>In messages</SectionLabel>}
                      {messages.map((g) => (
                        <li key={`group-${g.chat.id}`} role="presentation" className="pb-1">
                          <p className="flex items-center gap-2 px-3 pb-0.5 pt-2 text-[13px] text-muted">
                            <MessageSquare className="size-3.5" />
                            <span className="min-w-0 truncate text-fg/80">
                              <Marked value={g.chat.title} />
                            </span>
                            <span className="shrink-0 font-mono text-[11px]">
                              {[g.chat.projectName, now ? standaloneStamp(g.chat.updatedAt, now) : null].filter(Boolean).join(" · ")}
                            </span>
                          </p>
                          <ul role="group" aria-label={g.chat.title.text}>
                            {g.hits.map((h) =>
                              option(
                                <>
                                  <span className="w-11 shrink-0 pt-[3px] font-mono text-[11px] text-subtle">{h.role === "user" ? "You" : "Karui"}</span>
                                  <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug text-muted">
                                    <Marked value={h.snippet} />
                                  </span>
                                </>,
                                `message-${h.id}`,
                              ),
                            )}
                          </ul>
                          {g.more > 0 && (
                            <p className="pb-1 pl-[4.25rem] pt-0.5 font-mono text-[11px] text-subtle">
                              +{g.more} more in this chat
                            </p>
                          )}
                        </li>
                      ))}
                    </>
                  )}
                </ul>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] font-mono text-[11px] text-muted sm:pb-3">
              <span>Searched on this device. Nothing leaves your browser.</span>
              <AnimatePresence initial={false}>
                {indexing && (
                  <motion.span
                    key="indexing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    aria-live="polite"
                    className="flex items-center gap-2 tabular-nums"
                  >
                    {indexing.paused ? (
                      <>Paused at {indexing.done} of {indexing.total} chats. Resumes next time.</>
                    ) : (
                      <>
                        <Spinner className="size-3" />
                        Decrypting {indexing.done} of {indexing.total} chats
                      </>
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
