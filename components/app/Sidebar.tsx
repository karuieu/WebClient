"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Ellipsis,
  Files,
  Folder,
  FolderInput,
  LogOut,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  Puzzle,
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
import { cx } from "@/lib/ui/cx";
import { useNow } from "@/components/kit/useMounted";
import { groupChats, useRecentMode } from "@/components/app/sidebarHistory";

export type SidebarChat = { id: string; title: string; starred: boolean; projectId?: string; projectName?: string; updatedAt?: string };
export type SidebarProject = { id: string; name: string };
export type SidebarUser = { name: string | null; email: string; plan: string; isFree: boolean };
export type SidebarWorkspace = { label: string; href: string };

export type SidebarProps = {
  chats: SidebarChat[];
  starredProjects: SidebarProject[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  active?: { section?: "new" | "chats" | "projects" | "artifacts" | "workspace" | null; chatId?: string | null; projectId?: string | null };
  user: SidebarUser;
  workspace?: SidebarWorkspace;
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
      className="relative ml-auto text-muted opacity-0 transition-opacity duration-150 group-hover:text-fg/80 group-hover:opacity-100 group-focus-visible:opacity-100"
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
        "sidebar-row group relative flex items-center gap-3 rounded-xl px-3 text-[13.5px] tracking-[-0.01em] transition-colors duration-150",
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
      className="sidebar-row group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 text-[13.5px] tracking-[-0.01em] text-muted transition-colors duration-150 hover:bg-surface-2/70 hover:text-fg"
    >
      <Search className="size-4" />
      <span className="truncate">Search</span>
      <RowKbd keys={["Mod", "K"]} />
    </button>
  );
}

function RowMenu({ label, items, icon, onOpenChange }: { label: string; items: MenuItem[]; icon?: React.ReactNode; onOpenChange?: (o: boolean) => void }) {
  return (
    <Menu label={label} items={items} onOpenChange={onOpenChange} className="absolute right-1 top-1/2 -translate-y-1/2">
      {({ open, triggerProps }) => (
        <button
          {...triggerProps}
          aria-label={label}
          className={cx(
            "sidebar-icon-button relative isolate grid cursor-pointer place-items-center rounded-lg text-muted transition-[opacity,color] duration-150 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:transition-colors before:duration-150 hover:text-fg hover:before:bg-fg/10",
            open
              ? "text-fg opacity-100 before:bg-fg/10"
              : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-has-[:focus-visible]/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100",
          )}
        >
          {icon ?? <Ellipsis />}
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
  const inputId = React.useId();

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
        <div className="sidebar-row relative flex items-center rounded-xl bg-elevated px-3 ring-1 ring-line-strong">
          <label htmlFor={inputId} className="sr-only">
            Chat title
          </label>
          <input
            id={inputId}
            ref={inputRef}
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
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
            title={chat.title}
            aria-current={active ? "page" : undefined}
            className={cx(
              "sidebar-row sidebar-chat relative flex items-center gap-2 rounded-xl pl-3 pr-10 text-[13.5px] tracking-[-0.01em] transition-colors duration-150",
              active ? "text-fg" : menuOpen ? "bg-surface-2/70 text-fg" : "text-muted group-hover/row:bg-surface-2/70 group-hover/row:text-fg",
            )}
          >
            {active && <ActivePill id={`sidebar-active-${p.variant}`} />}
            <span className="relative min-w-0 flex-1 truncate">{chat.title}</span>
            {chat.projectName && (
              <span className={cx("relative max-w-[6.5rem] shrink-0 truncate font-mono text-[11px] group-hover/row:text-fg/80", menuOpen ? "text-fg/80" : "text-muted")}>
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
          "sidebar-row sidebar-chat relative flex items-center gap-2.5 rounded-xl pl-3 pr-10 text-[13.5px] tracking-[-0.01em] transition-colors duration-150",
          active ? "text-fg" : menuOpen ? "bg-surface-2/70 text-fg" : "text-muted group-hover/row:bg-surface-2/70 group-hover/row:text-fg",
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

function CollapsibleSection({ title, collapsed, onToggle, children, action, menuOpen = false, className }: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
  menuOpen?: boolean;
  className?: string;
}) {
  const contentId = React.useId();
  return (
    <section className={className}>
      <div className="group/row relative flex min-h-7 items-center gap-1">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={contentId}
            onClick={onToggle}
            className={cx(
              "sidebar-row relative flex w-full cursor-pointer items-center gap-1.5 rounded-xl pl-3 pr-10 text-left transition-colors duration-150",
              menuOpen ? "bg-surface-2/70 text-fg" : "text-muted group-hover/row:bg-surface-2/70 group-hover/row:text-fg",
            )}
          >
            <span className={cx("text-label", !menuOpen && "text-fg/80 group-hover/row:text-fg")}>{title}</span>
            <ChevronDown className={cx("size-3 shrink-0 transition-transform duration-200", collapsed && "-rotate-90")} />
          </button>
        </h2>
        {action}
      </div>
      <div id={contentId} hidden={collapsed} className="pt-1">{children}</div>
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
            "group/account flex w-full cursor-pointer items-center gap-3 rounded-xl p-2 text-left transition-colors duration-150",
            open ? "bg-surface-2/70" : "hover:bg-surface-2/70",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated font-mono text-[13px] font-medium text-fg ring-1 ring-line-strong">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">{user.name || user.email}</span>
            <span className={cx("block font-mono text-[11px] group-hover/account:text-fg/80", open ? "text-fg/80" : "text-muted")}>{user.plan}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted" />
        </button>
      )}
    </Menu>
  );
}

export function Sidebar(p: Internal): React.JSX.Element {
  const { chats, starredProjects, loading, error, active, user, variant } = p;
  const now = useNow();
  const starredChats = chats.filter((c) => c.starred);
  const recent = chats.filter((c) => !c.starred)
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))
    .slice(0, 30);
  const hasStarred = starredChats.length > 0 || starredProjects.length > 0;
  const pillId = `sidebar-active-${variant}`;
  const action = headerAction[variant];
  const [recentMode, setRecentMode] = useRecentMode();
  const [recentMenuOpen, setRecentMenuOpen] = useMenuState(p.onMenuOpenChange);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setCollapsed((all) => ({ ...all, [key]: !all[key] }));
  const recentMenu: MenuItem[] = [
    { type: "header", content: <span className="text-label text-muted">Group chats</span> },
    { label: "By date", checked: recentMode === "dates", onSelect: () => setRecentMode("dates") },
    { label: "No grouping", checked: recentMode === "none", onSelect: () => setRecentMode("none") },
  ];
  const groups = recentMode === "dates" ? groupChats(recent, now) : [{ id: "recent", label: "Recent", chats: recent }];
  const recentOptions = <RowMenu label="Recent options" items={recentMenu} icon={<Sliders className="size-3.5" />} onOpenChange={setRecentMenuOpen} />;

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
            className={cx("grid cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94]", variant === "drawer" ? "size-11" : "size-9")}
          >
            {action.icon}
          </button>
        </Tooltip>
        <Link href="/new" onClick={p.onNavigate} aria-label="Karui: new chat" className="flex min-h-9 items-center gap-2 rounded-lg px-1">
          <Logo className="h-3.5" />
        </Link>
      </div>

      <div className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        <nav aria-label="Library" className="flex shrink-0 flex-col gap-0.5 px-3 pb-3 pt-2">
          <NavRow href="/new" label="New chat" icon={<Plus className="size-4" />} active={active?.section === "new"} pillId={pillId} shortcut={["Mod", "Shift", "O"]} onNavigate={p.onNavigate} />
          {p.onOpenSearch && (
            <SearchRow onClick={() => { p.onNavigate?.(); p.onOpenSearch?.(); }} />
          )}
          <NavRow href="/chats" label="Chats" icon={<MessageSquare className="size-4" />} active={active?.section === "chats"} pillId={pillId} onNavigate={p.onNavigate} />
          <NavRow href="/projects" label="Projects" icon={<Folder className="size-4" />} active={active?.section === "projects" && !starredProjects.some((x) => x.id === active?.projectId)} pillId={pillId} onNavigate={p.onNavigate} />
          <NavRow href="/artifacts" label="Artifacts" icon={<Files className="size-4" />} active={active?.section === "artifacts"} pillId={pillId} onNavigate={p.onNavigate} />
          {p.workspace && (
            <NavRow href={p.workspace.href} label={p.workspace.label} icon={<Puzzle className="size-4" />} active={active?.section === "workspace"} pillId={pillId} onNavigate={p.onNavigate} />
          )}
        </nav>

        <div className="shrink-0 grow px-3 pb-4 pt-3" aria-busy={loading || undefined}>
          {loading ? (
            <div role="status">
              <span className="sr-only">Loading your chats</span>
              <ul aria-hidden="true" className="flex flex-col gap-1 pt-2">
                {[72, 88, 60, 80, 66, 90].map((w, i) => (
                  <li key={i} className="sidebar-row flex items-center px-3">
                    <span className="h-2.5 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
                  </li>
                ))}
              </ul>
            </div>
          ) : error ? (
            <div role="alert" className="px-3 py-3">
              <p className="text-[13px] font-medium text-fg">Couldn&apos;t load your chats</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{error}</p>
              {p.onRetry && <button type="button" onClick={p.onRetry} className="mt-3 min-h-11 cursor-pointer rounded-full border border-line-strong px-4 text-[13px] text-fg hover:bg-surface-2">Try again</button>}
            </div>
          ) : (
            <div className="space-y-3">
              {hasStarred && (
                <CollapsibleSection title="Starred" collapsed={collapsed.starred ?? false} onToggle={() => toggleSection("starred")}>
                  <ul className="flex flex-col gap-0.5">
                    {starredProjects.map((x) => <ProjectRow key={x.id} project={x} active={active?.projectId === x.id} p={p} />)}
                    {starredChats.map((c) => <ChatRow key={c.id} chat={c} active={active?.chatId === c.id} p={p} />)}
                  </ul>
                </CollapsibleSection>
              )}
              {recent.length > 0 ? groups.map((group, i) => (
                <CollapsibleSection
                  key={group.id}
                  title={group.label}
                  collapsed={collapsed[`history-${group.id}`] ?? false}
                  onToggle={() => toggleSection(`history-${group.id}`)}
                  action={i === 0 ? recentOptions : undefined}
                  menuOpen={i === 0 && recentMenuOpen}
                  className={i === 0 && hasStarred ? "pt-3" : undefined}
                >
                  <ul className="flex flex-col gap-0.5">
                    {group.chats.map((c) => <ChatRow key={c.id} chat={c} active={active?.chatId === c.id} p={p} />)}
                  </ul>
                </CollapsibleSection>
              )) : (
                <CollapsibleSection title="Recent" collapsed={collapsed["history-recent"] ?? false} onToggle={() => toggleSection("history-recent")} action={recentOptions} menuOpen={recentMenuOpen} className={hasStarred ? "pt-3" : undefined}>
                  <p className="px-3 py-2 text-[13px] leading-relaxed text-muted">{hasStarred ? "Your other conversations will show up here." : "Start a chat. You'll find it here when you come back."}</p>
                </CollapsibleSection>
              )}
              {recent.length > 0 && (
                <Link href="/chats" onClick={p.onNavigate} className="sidebar-row flex w-full items-center justify-between gap-3 rounded-xl px-3 text-[13.5px] tracking-[-0.01em] text-muted transition-colors duration-150 hover:bg-surface-2/70 hover:text-fg">
                  <span>See all chats</span>
                  <ChevronRight className="size-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-line p-2">
        {user.isFree && (
          <button
            type="button"
            onClick={p.onUpgrade}
            className="group mb-1 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-2/70 [@media(pointer:coarse)]:min-h-11"
          >
            <span className="text-[12.5px] leading-snug text-muted group-hover:text-fg/80">
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
