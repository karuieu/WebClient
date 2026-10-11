"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronsUpDown,
  Ellipsis,
  Folder,
  FolderInput,
  LogOut,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Sliders,
  Star,
  Trash,
  X,
} from "@/components/kit/icons";
import { Logo } from "@/components/kit/Logo";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Kbd, useShortcut, type Keys } from "@/components/kit/Shortcut";
import { Tooltip } from "@/components/kit/Tooltip";
import { cx } from "@/lib/cx";

export type SidebarChat = { id: string; title: string; starred: boolean; projectId?: string; projectName?: string };
export type SidebarProject = { id: string; name: string };
export type SidebarUser = { name: string | null; email: string; plan: string; isFree: boolean };

export type SidebarProps = {
  chats: SidebarChat[];
  starredProjects: SidebarProject[];
  loading?: boolean;
  active?: { section?: "new" | "chats" | "projects" | null; chatId?: string | null; projectId?: string | null };
  user: SidebarUser;
  onStarChat: (chat: SidebarChat) => void;
  onRenameChat: (chat: SidebarChat, title: string) => void;
  onMoveChat: (chat: SidebarChat) => void;
  onDeleteChat: (chat: SidebarChat) => void;
  onUnstarProject: (project: SidebarProject) => void;
  onEditProject: (project: SidebarProject) => void;
  onDeleteProject: (project: SidebarProject) => void;
  onOpenSettings: () => void;
  onOpenSearch?: () => void;
  onUpgrade: () => void;
  onLogout: () => void;
};

type Variant = "docked" | "peek" | "drawer";

type Internal = SidebarProps & {
  variant: Variant;
  onHeaderAction: () => void;
  onNavigate?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
};

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

const headerAction: Record<Variant, { label: string; icon: React.ReactNode }> = {
  docked: { label: "Hide sidebar", icon: <PanelLeft className="size-[18px]" /> },
  peek: { label: "Keep sidebar open", icon: <PanelLeft className="size-[18px]" /> },
  drawer: { label: "Close sidebar", icon: <X className="size-[18px]" /> },
};

function ActivePill({ id }: { id: string }) {
  return (
    <motion.span
      layoutId={id}
      transition={spring}
      className="absolute inset-0 rounded-xl bg-elevated shadow-soft ring-1 ring-line"
    />
  );
}

function RowKbd({ keys }: { keys?: Keys }) {
  if (!keys) return null;
  return (
    <Kbd
      keys={keys}
      className="relative ml-auto text-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    />
  );
}

function NavRow({
  href,
  icon,
  label,
  active,
  pillId,
  shortcut,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  pillId: string;
  shortcut?: Keys;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] tracking-[-0.01em] transition-colors duration-150",
        active ? "text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg",
      )}
    >
      {active && <ActivePill id={pillId} />}
      <span className="relative">{icon}</span>
      <span className="relative truncate">{label}</span>
      <RowKbd keys={shortcut} />
    </Link>
  );
}

function SearchRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-9 cursor-pointer items-center gap-3 rounded-xl px-3 text-[13.5px] tracking-[-0.01em] text-muted transition-colors duration-150 hover:bg-surface-2/70 hover:text-fg"
    >
      <Search className="size-4" />
      <span className="truncate">Search</span>
      <RowKbd keys={["Mod", "K"]} />
    </button>
  );
}

function RowMenu({ label, items, onOpenChange }: { label: string; items: MenuItem[]; onOpenChange: (o: boolean) => void }) {
  return (
    <Menu label={label} items={items} onOpenChange={onOpenChange} className="absolute right-1 top-1/2 -translate-y-1/2">
      {({ open, triggerProps }) => (
        <button
          {...triggerProps}
          aria-label={label}
          className={cx(
            "grid size-7 cursor-pointer place-items-center rounded-lg text-muted transition-[opacity,background-color,color] duration-150 hover:bg-surface-2 hover:text-fg",
            open
              ? "bg-surface-2 text-fg opacity-100"
              : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100",
          )}
        >
          <Ellipsis />
        </button>
      )}
    </Menu>
  );
}

function useMenuState(onMenuOpenChange?: (open: boolean) => void) {
  const [open, setOpen] = React.useState(false);
  const change = React.useCallback(
    (o: boolean) => {
      setOpen(o);
      onMenuOpenChange?.(o);
    },
    [onMenuOpenChange],
  );
  return [open, change] as const;
}

function ChatRow({ chat, active, p }: { chat: SidebarChat; active: boolean; p: Internal }) {
  const [menuOpen, setMenuOpen] = useMenuState(p.onMenuOpenChange);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(chat.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== chat.title) p.onRenameChat(chat, t);
    else setDraft(chat.title);
  };

  const items: MenuItem[] = [
    {
      label: chat.starred ? "Unstar" : "Star",
      icon: <Star filled={chat.starred} className="size-3.5" />,
      onSelect: () => p.onStarChat(chat),
    },
    {
      label: "Rename",
      icon: <Pencil className="size-3.5" />,
      onSelect: () => {
        setDraft(chat.title);
        setEditing(true);
      },
    },
    { label: "Move to project", icon: <FolderInput className="size-3.5" />, onSelect: () => p.onMoveChat(chat) },
    { type: "separator" },
    { label: "Delete", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => p.onDeleteChat(chat) },
  ];

  return (
    <li className="group/row relative">
      {editing ? (
        <div className="relative flex h-9 items-center rounded-xl bg-elevated px-3 ring-1 ring-line-strong">
          <label htmlFor={`rename-${p.variant}-${chat.id}`} className="sr-only">
            Chat title
          </label>
          <input
            id={`rename-${p.variant}-${chat.id}`}
            ref={inputRef}
            data-focus="within"
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
            className="w-full bg-transparent text-[13.5px] tracking-[-0.01em] text-fg outline-none"
          />
        </div>
      ) : (
        <>
          <Link
            href={chat.projectId ? `/projects/${chat.projectId}/${chat.id}` : `/chat/${chat.id}`}
            onClick={p.onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex h-9 items-center gap-2 rounded-xl pl-3 pr-9 text-[13.5px] tracking-[-0.01em] transition-colors duration-150",
              active ? "text-fg" : menuOpen ? "bg-surface-2/70 text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg",
            )}
          >
            {active && <ActivePill id={`sidebar-active-${p.variant}`} />}
            <span className="relative min-w-0 flex-1 truncate">{chat.title}</span>
            {chat.projectName && (
              <span className="relative max-w-[6.5rem] shrink-0 truncate font-mono text-[11px] text-muted">
                <span className="sr-only">in project </span>
                {chat.projectName}
              </span>
            )}
          </Link>
          <RowMenu label={`Actions for ${chat.title}`} items={items} onOpenChange={setMenuOpen} />
        </>
      )}
    </li>
  );
}

function ProjectRow({ project, active, p }: { project: SidebarProject; active: boolean; p: Internal }) {
  const [menuOpen, setMenuOpen] = useMenuState(p.onMenuOpenChange);
  const items: MenuItem[] = [
    { label: "Unstar", icon: <Star filled className="size-3.5" />, onSelect: () => p.onUnstarProject(project) },
    { label: "Project settings", icon: <Sliders className="size-3.5" />, onSelect: () => p.onEditProject(project) },
    { type: "separator" },
    { label: "Delete", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => p.onDeleteProject(project) },
  ];
  return (
    <li className="group/row relative">
      <Link
        href={`/projects/${project.id}`}
        onClick={p.onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "relative flex h-9 items-center gap-2.5 rounded-xl pl-3 pr-9 text-[13.5px] tracking-[-0.01em] transition-colors duration-150",
          active ? "text-fg" : menuOpen ? "bg-surface-2/70 text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg",
        )}
      >
        {active && <ActivePill id={`sidebar-active-${p.variant}`} />}
        <Folder className="relative size-3.5" />
        <span className="relative truncate">{project.name}</span>
      </Link>
      <RowMenu label={`Actions for ${project.name}`} items={items} onOpenChange={setMenuOpen} />
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="text-label px-3 pb-2 text-fg/80">{title}</h2>
      {children}
    </section>
  );
}

function Account({ p }: { p: Internal }) {
  const { user } = p;
  const [open, setOpen] = useMenuState(p.onMenuOpenChange);
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  const settingsKeys = useShortcut(["Mod", "Shift", ","]);

  const items: MenuItem[] = [
    { label: "Settings", icon: <Sliders className="size-3.5" />, onSelect: p.onOpenSettings, hint: settingsKeys ?? undefined },
    {
      label: user.isFree ? "Upgrade to Pro" : "Plans",
      icon: <ArrowUpRight className="size-3.5" />,
      onSelect: p.onUpgrade,
    },
    { type: "separator" },
    { label: "Log out", icon: <LogOut className="size-3.5" />, onSelect: p.onLogout },
  ];

  return (
    <Menu label="Account" items={items} placement="top-start" panelClassName="w-[220px]" onOpenChange={setOpen}>
      {({ triggerProps }) => (
        <button
          {...triggerProps}
          aria-label={`Account: ${user.name || user.email}`}
          className={cx(
            "flex w-full cursor-pointer items-center gap-3 rounded-xl p-2 text-left transition-colors duration-150",
            open ? "bg-surface-2/70" : "hover:bg-surface-2/70",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated font-mono text-[13px] font-medium text-fg ring-1 ring-line-strong">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">{user.name || user.email}</span>
            <span className="block font-mono text-[11px] text-muted">{user.plan}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted" />
        </button>
      )}
    </Menu>
  );
}

export function Sidebar(p: Internal) {
  const { chats, starredProjects, loading, active, user, variant } = p;
  const starredChats = chats.filter((c) => c.starred);
  const recent = chats.filter((c) => !c.starred).slice(0, 10);
  const hasStarred = starredChats.length > 0 || starredProjects.length > 0;
  const pillId = `sidebar-active-${variant}`;
  const action = headerAction[variant];

  return (
    <aside
      aria-label="Sidebar"
      className={cx(
        "flex h-full w-[280px] shrink-0 flex-col overflow-hidden border-r border-line",
        variant === "peek" ? "bg-elevated shadow-soft" : "bg-surface",
        variant === "drawer" && "w-[min(300px,85vw)]",
      )}
    >
      <div
        className={cx(
          "flex shrink-0 items-center gap-1.5",
          variant === "drawer" ? "h-14 pl-2" : "h-14 pl-3",
        )}
      >
        <Tooltip label={action.label} keys={["Mod", "B"]} className="shrink-0">
          <button
            type="button"
            aria-label={action.label}
            onClick={p.onHeaderAction}
            className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94]"
          >
            {action.icon}
          </button>
        </Tooltip>
        <Link href="/new" onClick={p.onNavigate} aria-label="Karui — new chat" className="flex items-center gap-2 rounded-lg px-1">
          <Logo className="h-3.5" />
        </Link>
      </div>

      <nav aria-label="Library" className="flex shrink-0 flex-col gap-0.5 px-3">
        <NavRow
          href="/new"
          label="New chat"
          icon={<Plus className="size-4" />}
          active={active?.section === "new"}
          pillId={pillId}
          shortcut={["Mod", "Shift", "O"]}
          onNavigate={p.onNavigate}
        />
        {p.onOpenSearch && (
          <SearchRow
            onClick={() => {
              p.onNavigate?.();
              p.onOpenSearch?.();
            }}
          />
        )}
        <NavRow
          href="/chats"
          label="Chats"
          icon={<MessageSquare className="size-4" />}
          active={active?.section === "chats"}
          pillId={pillId}
          onNavigate={p.onNavigate}
        />
        <NavRow
          href="/projects"
          label="Projects"
          icon={<Folder className="size-4" />}
          active={active?.section === "projects" && !starredProjects.some((x) => x.id === active?.projectId)}
          pillId={pillId}
          onNavigate={p.onNavigate}
        />
      </nav>

      <div className="relative mt-5 min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-4 [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-24px),transparent)]">
          {loading ? (
            <ul aria-label="Loading chats" className="flex flex-col gap-1 pt-3">
              {[72, 88, 60, 80, 66, 90].map((w, i) => (
                <li key={i} className="flex h-9 items-center px-3">
                  <span className="h-2.5 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="pt-3">
              {hasStarred && (
                <Section title="Starred">
                  <ul className="flex flex-col gap-0.5">
                    {starredProjects.map((x) => (
                      <ProjectRow key={x.id} project={x} active={active?.projectId === x.id} p={p} />
                    ))}
                    {starredChats.map((c) => (
                      <ChatRow key={c.id} chat={c} active={active?.chatId === c.id} p={p} />
                    ))}
                  </ul>
                </Section>
              )}
              <Section title="Recent">
                {recent.length ? (
                  <ul className="flex flex-col gap-0.5">
                    {recent.map((c) => (
                      <ChatRow key={c.id} chat={c} active={active?.chatId === c.id} p={p} />
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 text-[13px] leading-relaxed text-muted">Your conversations will show up here.</p>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-line p-2">
        {user.isFree && (
          <button
            type="button"
            onClick={p.onUpgrade}
            className="group mb-1 flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-2/70"
          >
            <span className="text-[12.5px] leading-snug text-muted">
              <span className="font-medium text-fg">Pro</span> · more models, more room
            </span>
            <ArrowUpRight className="size-3.5 text-muted transition-transform duration-200 ease-out-soft group-hover:-translate-y-px group-hover:translate-x-px" />
          </button>
        )}
        <Account p={p} />
      </div>
    </aside>
  );
}
