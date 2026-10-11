"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ButtonLink } from "@/components/kit/Button";
import { Label } from "@/components/kit/Frame";
import { Check, Ellipsis, Folder, FolderInput, Pencil, Plus, Search, Star, Trash, X } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { cx } from "@/lib/cx";
import { useNow } from "@/components/kit/useMounted";
import { Enter, cascade } from "@/components/kit/Enter";
import { Tooltip } from "@/components/kit/Tooltip";

export type ChatsListItem = { id: string; title: string; starred: boolean; projectName?: string | null; updatedAt: string };

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

function dayDiff(d: Date, now: Date) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function stamp(iso: string, now: Date) {
  const d = new Date(iso);
  const days = dayDiff(d, now);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days === 0) {
    const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)} h ago`;
  }
  if (days === 1) return time;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function standaloneStamp(iso: string, now: Date) {
  const d = new Date(iso);
  const days = dayDiff(d, now);
  if (days === 0) return stamp(iso, now);
  if (days === 1) return "yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function groupOf(iso: string, now: Date) {
  const d = new Date(iso);
  const days = dayDiff(d, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[4px] bg-surface-2 px-0.5 text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function SelectDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-150",
        checked ? "border-inverse bg-inverse text-on-inverse" : "border-line-strong",
      )}
    >
      <Check className={cx("size-3 transition-[opacity,transform] duration-150", checked ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
    </span>
  );
}

export function ChatListRow({
  chat,
  query = "",
  now,
  selecting = false,
  selected = false,
  onToggle,
  menuItems,
  onRename,
  standalone,
  enterDelay,
}: {
  chat: ChatsListItem;
  query?: string;
  now: Date | null;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  menuItems: (startRename: () => void) => MenuItem[];
  onRename: (title: string) => void;
  standalone?: boolean;
  enterDelay?: number;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(chat.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== chat.title) onRename(t);
    else setDraft(chat.title);
  };

  const items = menuItems(() => {
    setDraft(chat.title);
    setEditing(true);
  });

  const meta = (
    <span className="mt-1 flex items-center gap-2 font-mono text-[11.5px] text-muted">
      <span className="min-w-12">{now ? (standalone ? standaloneStamp(chat.updatedAt, now) : stamp(chat.updatedAt, now)) : "\u00a0"}</span>
      {chat.projectName && (
        <>
          <span aria-hidden="true">·</span>
          <span className="flex min-w-0 items-center gap-1">
            <Folder className="size-3" />
            <span className="truncate">{chat.projectName}</span>
          </span>
        </>
      )}
    </span>
  );

  const body = (
    <>
      <AnimatePresence initial={false}>
        {selecting && (
          <motion.span
            key="dot"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 32, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={spring}
            className="flex shrink-0 items-center overflow-hidden"
          >
            <SelectDot checked={selected} />
          </motion.span>
        )}
      </AnimatePresence>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {chat.starred && <Star filled className="size-3 shrink-0 text-muted" />}
          <span className="truncate text-[15px] tracking-[-0.01em]">
            <Highlight text={chat.title} query={query} />
          </span>
        </span>
        {meta}
      </span>
    </>
  );

  const rowClass = cx(
    "relative flex min-h-[4.25rem] w-full items-center rounded-2xl px-4 py-3 text-left transition-colors duration-150",
    selected ? "bg-surface" : menuOpen ? "bg-surface" : "hover:bg-surface",
  );

  const row = (
    <li className="group/row relative">
      {editing ? (
        <div className="flex min-h-[4.25rem] items-center rounded-2xl bg-surface px-4">
          <input
            ref={inputRef}
            data-focus="within"
            aria-label="Chat title"
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(chat.title);
                setEditing(false);
              }
            }}
            className="h-10 w-full rounded-xl bg-elevated px-3 text-[15px] tracking-[-0.01em] outline-none ring-1 ring-line-strong"
          />
        </div>
      ) : selecting ? (
        <button type="button" role="checkbox" aria-checked={selected} onClick={onToggle} className={cx(rowClass, "cursor-pointer")}>
          {body}
        </button>
      ) : (
        <>
          <Link href={`/chat/${chat.id}`} className={cx(rowClass, "pr-14")}>
            {body}
          </Link>
          <Menu label={`Actions for ${chat.title}`} items={items} onOpenChange={setMenuOpen} className="absolute right-3 top-1/2 -translate-y-1/2">
            {({ open, triggerProps }) => (
              <button
                {...triggerProps}
                aria-label={`Actions for ${chat.title}`}
                className={cx(
                  "grid size-8 cursor-pointer place-items-center rounded-full text-muted transition-[opacity,background-color,color] duration-150 hover:bg-surface-2 hover:text-fg",
                  open
                    ? "bg-surface-2 text-fg"
                    : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100",
                )}
              >
                <Ellipsis />
              </button>
            )}
          </Menu>
        </>
      )}
    </li>
  );

  return enterDelay === undefined ? (
    row
  ) : (
    <Enter delay={enterDelay} offset={8} blur={false}>
      {row}
    </Enter>
  );
}

export function SearchField({
  ref,
  value,
  onChange,
  placeholder,
  label,
  shortcut,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  shortcut?: string;
}) {
  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line-strong bg-elevated pl-4 pr-2 transition-[border-color] duration-150 focus-within:border-fg/30">
      <Search className="size-4 text-muted" />
      <span className="sr-only">{label}</span>
      <input
        ref={ref}
        data-focus="within"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] tracking-[-0.01em] outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="grid size-7 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        shortcut && <kbd className="mr-1 hidden rounded-md border border-line px-1.5 font-mono text-[11px] text-muted sm:block">{shortcut}</kbd>
      )}
    </label>
  );
}

export type ChatsViewProps = {
  chats: ChatsListItem[];
  total: number;
  loading?: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  hasMore?: boolean;
  onShowMore?: () => void;
  actions: {
    onStar: (c: ChatsListItem) => void;
    onRename: (c: ChatsListItem, title: string) => void;
    onMove: (chats: ChatsListItem[]) => void;
    onDelete: (chats: ChatsListItem[]) => void;
  };
};

export function ChatsView({ chats, total, loading, query, onQueryChange, hasMore, onShowMore, actions }: ChatsViewProps) {
  const reduce = useReducedMotion();
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const searchRef = React.useRef<HTMLInputElement>(null);
  const now = useNow();

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && selecting && !typing) exitSelect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groups = React.useMemo(() => {
    const map = new Map<string, ChatsListItem[]>();
    for (const c of chats) {
      const g = now ? groupOf(c.updatedAt, now) : "\u00a0";
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return [...map.entries()];
  }, [chats, now]);

  const first = React.useRef(true);
  React.useEffect(() => {
    if (!loading && chats.length) first.current = false;
  }, [loading, chats.length]);
  const order = React.useMemo(() => new Map(chats.map((c, i) => [c.id, i])), [chats]);

  const picked = chats.filter((c) => selected.has(c.id));
  const allSelected = chats.length > 0 && picked.length === chats.length;

  return (
    <div className="mx-auto w-full max-w-[48rem] px-4 pb-40 pt-16 sm:px-6 md:pt-20">
      <Enter>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Label>Library</Label>
            <h1 className="text-title mt-4">Chats</h1>
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            {!loading && total > 0 && <span className="mr-2 font-mono text-[12px] text-muted tabular-nums">{total} chats</span>}
            <Tooltip keys={["Mod", "Shift", "O"]} align="end">
              <ButtonLink href="/new" size="md">
                <Plus className="size-4" />
                New chat
              </ButtonLink>
            </Tooltip>
          </div>
        </div>
      </Enter>

      <Enter delay={60}>
        <div className="mt-10 flex items-center gap-2">
          <SearchField ref={searchRef} value={query} onChange={onQueryChange} placeholder="Search your chats" label="Search chats" shortcut="/" />
          <button
            type="button"
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            aria-pressed={selecting}
            disabled={!chats.length}
            className={cx(
              "h-11 shrink-0 cursor-pointer rounded-full px-4 text-[14px] font-medium tracking-[-0.01em] transition-[background-color,color] duration-150 disabled:cursor-default disabled:opacity-40",
              selecting ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg",
            )}
          >
            {selecting ? "Done" : "Select"}
          </button>
        </div>
      </Enter>
      <Enter delay={90}>
        <p className="mt-2.5 pl-4 font-mono text-[11px] text-muted">Titles are searched on this device. Nothing leaves your browser.</p>
      </Enter>

      <div className="mt-10">
        {loading ? (
          <ul aria-label="Loading chats" className="flex flex-col gap-1">
            {[62, 78, 54, 70, 66].map((w, i) => (
              <li key={i} className="flex min-h-[4.25rem] flex-col justify-center gap-2 px-4">
                <span className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
                <span className="h-2 w-24 animate-pulse rounded-full bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : !chats.length ? (
          <div className="rounded-3xl border border-line px-6 py-16 text-center">
            {query ? (
              <>
                <p className="text-[15px] font-medium tracking-[-0.01em]">Nothing matches “{query}”.</p>
                <p className="mt-1.5 text-[14px] text-muted">Only titles are searched.</p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-medium tracking-[-0.01em]">No chats yet.</p>
                <p className="mt-1.5 text-[14px] text-muted">Your conversations will live here, encrypted.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {selecting && (
              <div className="mb-3 flex items-center justify-between px-4">
                <span className="font-mono text-[12px] text-muted" aria-live="polite">
                  {picked.length ? `${picked.length} selected` : "Tap chats to select them"}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(chats.map((c) => c.id)))}
                  className="cursor-pointer text-[13px] font-medium text-fg/80 hover:text-fg"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
            )}
            {groups.map(([group, items]) => (
              <section key={group} className="mb-8">
                <Enter delay={first.current ? cascade(order.get(items[0].id) ?? 0) : 0} offset={8} blur={false}>
                  <h2 className="text-label mb-2 px-4 text-fg/80">{group}</h2>
                </Enter>
                <ul className="flex flex-col gap-0.5">
                  {items.map((c) => (
                    <ChatListRow
                      key={c.id}
                      enterDelay={first.current ? cascade(order.get(c.id) ?? 0) : 0}
                      chat={c}
                      query={query}
                      now={now}
                      selecting={selecting}
                      selected={selected.has(c.id)}
                      onToggle={() => toggle(c.id)}
                      onRename={(t) => actions.onRename(c, t)}
                      menuItems={(rename) => [
                        {
                          label: c.starred ? "Unstar" : "Star",
                          icon: <Star filled={c.starred} className="size-3.5" />,
                          onSelect: () => actions.onStar(c),
                        },
                        { label: "Rename", icon: <Pencil className="size-3.5" />, onSelect: rename },
                        { label: "Move to project", icon: <FolderInput className="size-3.5" />, onSelect: () => actions.onMove([c]) },
                        { type: "separator" },
                        { label: "Delete", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => actions.onDelete([c]) },
                      ]}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {hasMore && onShowMore && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onShowMore}
                  className="h-10 cursor-pointer rounded-full px-5 text-[14px] font-medium text-muted ring-1 ring-inset ring-line-strong transition-colors duration-150 hover:bg-surface hover:text-fg"
                >
                  Show more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {selecting && picked.length > 0 && (
          <motion.div
            key="bulk"
            role="toolbar"
            aria-label="Selected chats"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, transition: { duration: 0.16 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-nav p-1.5 pl-5 shadow-soft backdrop-blur-xl backdrop-saturate-150"
          >
            <span className="mr-3 font-mono text-[12px] tabular-nums">{picked.length} selected</span>
            <button
              type="button"
              onClick={() => actions.onMove(picked)}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium transition-colors duration-150 hover:bg-surface"
            >
              <FolderInput className="size-3.5" />
              Move
            </button>
            <button
              type="button"
              onClick={() => actions.onDelete(picked)}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
            >
              <Trash className="size-3.5" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
