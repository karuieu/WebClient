"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileCode,
  Files,
  FileText,
  Folder,
  FolderInput,
  Globe,
  Layers,
  LogOut,
  MessageSquare,
  NotebookText,
  PanelLeft,
  Pencil,
  Plug,
  Plus,
  Presentation,
  Puzzle,
  Search,
  Sliders,
  Star,
  Trash,
  X,
} from "@/components/kit/icons";
import { LogoMark } from "@/components/kit/Logo";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Kbd, useShortcut, type Keys } from "@/components/kit/Shortcut";
import { Tooltip } from "@/components/kit/Tooltip";
import { cx } from "@/lib/ui/cx";
import { useNow } from "@/components/kit/useMounted";
import { groupChats, useRecentMode } from "@/components/app/sidebarHistory";
import { ARTIFACT_TYPES } from "@/components/app/artifacts/ArtifactGallery";
import { WORKSPACE_TABS, type WorkspaceTab } from "@/components/app/WorkspaceView";
import type { ArtifactType } from "@/lib/artifacts/artifacts";

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
  /** `view` is the artifact type or the workspace tab the screen shows. */
  active?: {
    section?: "new" | "chats" | "projects" | "artifacts" | "workspace" | null;
    view?: string | null;
    chatId?: string | null;
    projectId?: string | null;
  };
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

type Variant = "docked" | "drawer";

type Internal = SidebarProps & {
  variant: Variant;
  panelOpen: boolean;
  panelWidth: number;
  /** While the panel is being resized its width follows the pointer without a spring. */
  resizing?: boolean;
  onHeaderAction: () => void;
  onNavigate?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
};

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

/** The rail (56 px) and the panel together reach at most 420 px. */
export const PANEL_WIDTH = { min: 224, default: 260, max: 364 } as const;

function ActivePill({ id }: { id?: string }) {
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

function RowMenu({ label, items, icon, onOpenChange }: { label: string; items: MenuItem[]; icon?: React.ReactNode; onOpenChange: (o: boolean) => void }) {
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

function ChatRow({ chat, active, p, nested = false, inProject = false }: { chat: SidebarChat; active: boolean; p: Internal; nested?: boolean; inProject?: boolean }) {
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
            {active && <ActivePill id={nested ? undefined : `sidebar-active-${p.variant}`} />}
            <span className="relative min-w-0 flex-1 truncate">{chat.title}</span>
            {chat.projectName && !inProject && (
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

function ProjectRow({ project, starred, active, p }: { project: SidebarProject; starred: boolean; active: boolean; p: Internal }) {
  const [menuOpen, setMenuOpen] = useMenuState(p.onMenuOpenChange);
  const items: MenuItem[] = [
    ...(starred ? [{ label: "Unstar", icon: <Star filled className="size-3.5" />, onSelect: () => p.onUnstarProject(project) } satisfies MenuItem] : []),
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

function CollapsibleSection({
  title,
  collapsed,
  onToggle,
  children,
  action,
  menuOpen = false,
  className,
}: {
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
  const [open, setOpen] = React.useState(false);
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  const settingsKeys = useShortcut(["Mod", "Shift", ","]);

  const items: MenuItem[] = [
    {
      type: "header",
      content: (
        <span className="block px-1 pb-1">
          <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em] text-fg">{user.name || user.email}</span>
          <span className="block font-mono text-[11px] text-muted">{user.plan}</span>
        </span>
      ),
    },
    { type: "separator" },
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
          className={cx("rail-button grid cursor-pointer place-items-center rounded-xl transition-colors duration-150", open ? "bg-surface-2" : "hover:bg-surface-2")}
        >
          <span className="grid size-8 place-items-center rounded-full bg-elevated font-mono text-[13px] font-medium text-fg ring-1 ring-line-strong">
            {initial}
          </span>
        </button>
      )}
    </Menu>
  );
}

type Section = "chats" | "projects" | "artifacts" | "workspace";

function sectionOf(active: SidebarProps["active"]): Section {
  if (active?.projectId || active?.section === "projects") return "projects";
  if (active?.section === "artifacts" || active?.section === "workspace") return active.section;
  return "chats";
}

function sectionsOf(p: Internal): { id: Section; label: string; href: string; icon: React.ReactNode }[] {
  return [
    { id: "chats", label: "Chats", href: "/new", icon: <MessageSquare className="size-[18px]" /> },
    { id: "projects", label: "Projects", href: "/projects", icon: <Folder className="size-[18px]" /> },
    { id: "artifacts", label: "Artifacts", href: "/artifacts", icon: <Files className="size-[18px]" /> },
    ...(p.workspace ? [{ id: "workspace" as const, label: p.workspace.label, href: p.workspace.href, icon: <Puzzle className="size-[18px]" /> }] : []),
  ];
}

type Peek = ReturnType<typeof usePeek>;

// While the panel is hidden, hovering a section icon slides that section's panel over the content.
function usePeek() {
  const [section, setSection] = React.useState<Section | null>(null);
  const over = React.useRef(false);
  const menus = React.useRef(0);
  const panel = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const open = React.useCallback((next: Section) => {
    clearTimeout(timer.current);
    setSection(next);
  }, []);

  // Stays open while a row menu (portalled outside the panel) or an inline rename is in use.
  const scheduleClose = React.useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const editing = panel.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT";
      if (!over.current && menus.current === 0 && !editing) setSection(null);
    }, 200);
  }, []);

  const close = React.useCallback(() => {
    clearTimeout(timer.current);
    menus.current = 0;
    setSection(null);
  }, []);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return {
    section,
    panel,
    open,
    close,
    hoverProps: {
      onPointerEnter: () => {
        over.current = true;
        clearTimeout(timer.current);
      },
      onPointerLeave: () => {
        over.current = false;
        scheduleClose();
      },
    },
    onMenuOpenChange: (o: boolean) => {
      menus.current = Math.max(0, menus.current + (o ? 1 : -1));
      if (!o) scheduleClose();
    },
  };
}

function Rail({ p, section, peek }: { p: Internal; section: Section; peek: Peek }) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center bg-surface-2/60 pb-2.5" {...(p.panelOpen ? {} : peek.hoverProps)}>
      <div className="grid h-14 shrink-0 place-items-center">
        <Tooltip label="New chat" keys={["Mod", "Shift", "O"]} side="right">
          <Link href="/new" onClick={p.onNavigate} aria-label="Karui: new chat" className="rail-button grid place-items-center rounded-xl transition-colors duration-150 hover:bg-surface-2">
            <LogoMark className="size-5" />
          </Link>
        </Tooltip>
      </div>
      <nav aria-label="Sections" className="flex flex-col gap-1.5 pt-1">
        {sectionsOf(p).map((s) => {
          const current = section === s.id;
          const peeking = peek.section === s.id && !p.panelOpen;
          // With the panel hidden, the peek names the section itself, so a tooltip would only cover it.
          // The Tooltip stays mounted either way: swapping the wrapper would remount the active pill and replay its slide.
          return (
            <Tooltip key={s.id} label={p.panelOpen || p.variant === "drawer" ? s.label : undefined} side="right">
              <Link
                href={s.href}
                onClick={p.onNavigate}
                onPointerEnter={p.panelOpen ? undefined : () => peek.open(s.id)}
                aria-label={s.label}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "rail-button relative grid place-items-center rounded-xl transition-colors duration-150",
                  current ? "text-fg" : peeking ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {current && <ActivePill id={`rail-active-${p.variant}`} />}
                <span className="relative">{s.icon}</span>
              </Link>
            </Tooltip>
          );
        })}
      </nav>
      <div className="mt-auto">
        <Account p={p} />
      </div>
    </div>
  );
}

function ListState({ p, children }: { p: Internal; children: React.ReactNode }) {
  if (p.loading) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading your chats</span>
        <ul aria-hidden="true" className="flex flex-col gap-1 pt-2">
          {[72, 88, 60, 80, 66, 90].map((w, i) => (
            <li key={i} className="sidebar-row flex items-center px-3">
              <span className="h-2.5 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (p.error) {
    return (
      <div role="alert" className="px-3 py-3">
        <p className="text-[13px] font-medium text-fg">Couldn&apos;t load your chats</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{p.error}</p>
        {p.onRetry && <button type="button" onClick={p.onRetry} className="mt-3 min-h-11 cursor-pointer rounded-full border border-line-strong px-4 text-[13px] text-fg hover:bg-surface-2">Try again</button>}
      </div>
    );
  }
  return children;
}

function ChatsPanel({ p, pillId }: { p: Internal; pillId: string }) {
  const { chats, active } = p;
  const now = useNow();
  const starredChats = chats.filter((c) => c.starred);
  const recent = chats.filter((c) => !c.starred)
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))
    .slice(0, 30);
  const hasStarred = starredChats.length > 0;
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
  const recentOptions = (
    <RowMenu label="Recent options" items={recentMenu} icon={<Sliders className="size-3.5" />} onOpenChange={setRecentMenuOpen} />
  );

  return (
    <>
      <div className="flex flex-col gap-0.5 pb-3">
        <NavRow href="/new" label="New chat" icon={<Plus className="size-4" />} active={active?.section === "new"} pillId={pillId} shortcut={["Mod", "Shift", "O"]} onNavigate={p.onNavigate} />
      </div>
      <ListState p={p}>
        <div className="space-y-3">
          {hasStarred && (
            <CollapsibleSection title="Starred" collapsed={collapsed.starred ?? false} onToggle={() => toggleSection("starred")}>
              <ul className="flex flex-col gap-0.5">
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
      </ListState>
    </>
  );
}

type ProjectEntry = SidebarProject & { starred: boolean; chats: SidebarChat[] };

// Starred projects first, then every other project that has a recent chat.
function projectsOf(starred: SidebarProject[], chats: SidebarChat[]): ProjectEntry[] {
  const byId = new Map<string, ProjectEntry>(starred.map((x) => [x.id, { ...x, starred: true, chats: [] }]));
  for (const chat of chats) {
    if (!chat.projectId) continue;
    const entry = byId.get(chat.projectId) ?? { id: chat.projectId, name: chat.projectName ?? "", starred: false, chats: [] };
    entry.chats.push(chat);
    byId.set(chat.projectId, entry);
  }
  return [...byId.values()];
}

function ProjectsPanel({ p, pillId }: { p: Internal; pillId: string }) {
  const { active } = p;
  const projects = projectsOf(p.starredProjects, p.chats);
  return (
    <>
      <div className="flex flex-col gap-0.5 pb-3">
        <NavRow href="/projects" label="All projects" icon={<Folder className="size-4" />} active={active?.section === "projects" && !active.projectId} pillId={pillId} onNavigate={p.onNavigate} />
      </div>
      <ListState p={p}>
        {projects.length ? (
          <ul className="flex flex-col gap-1">
            {projects.map((x) => (
              <li key={x.id}>
                <ul className="flex flex-col gap-0.5">
                  <ProjectRow project={x} starred={x.starred} active={active?.projectId === x.id && !active.chatId} p={p} />
                </ul>
                {x.chats.length > 0 && (
                  <ul className="ml-4 flex flex-col gap-0.5 border-l border-line pl-1">
                    {x.chats.slice(0, 5).map((c) => <ChatRow key={c.id} chat={c} active={active?.chatId === c.id} p={p} nested inProject />)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-[13px] leading-relaxed text-muted">Projects keep related chats, files and instructions together.</p>
        )}
      </ListState>
    </>
  );
}

const ARTIFACT_ICONS: Record<ArtifactType, React.ReactNode> = {
  markdown: <FileText className="size-4" />,
  html: <Globe className="size-4" />,
  code: <FileCode className="size-4" />,
  slides: <Presentation className="size-4" />,
};

function ArtifactsPanel({ p, pillId }: { p: Internal; pillId: string }) {
  const view = p.active?.view ?? "all";
  return (
    <div className="flex flex-col gap-0.5">
      <NavRow href="/artifacts" label="All artifacts" icon={<Files className="size-4" />} active={view === "all"} pillId={pillId} onNavigate={p.onNavigate} />
      {ARTIFACT_TYPES.map((t) => (
        <NavRow key={t.id} href={`/artifacts?type=${t.id}`} label={t.label} icon={ARTIFACT_ICONS[t.id]} active={view === t.id} pillId={pillId} onNavigate={p.onNavigate} />
      ))}
    </div>
  );
}

const WORKSPACE_ICONS: Record<WorkspaceTab, React.ReactNode> = {
  skills: <NotebookText className="size-4" />,
  connectors: <Plug className="size-4" />,
  memory: <Layers className="size-4" />,
  instructions: <FileText className="size-4" />,
};

function WorkspacePanel({ p, pillId }: { p: Internal; pillId: string }) {
  const view = p.active?.view ?? "skills";
  const href = p.workspace?.href ?? "/workspace";
  return (
    <div className="flex flex-col gap-0.5">
      {WORKSPACE_TABS.map((t) => (
        <NavRow key={t.id} href={`${href}?tab=${t.id}`} label={t.label} icon={WORKSPACE_ICONS[t.id]} active={view === t.id} pillId={pillId} onNavigate={p.onNavigate} />
      ))}
    </div>
  );
}

const PANELS: Record<Section, (props: { p: Internal; pillId: string }) => React.JSX.Element> = {
  chats: ChatsPanel,
  projects: ProjectsPanel,
  artifacts: ArtifactsPanel,
  workspace: WorkspacePanel,
};

/** With `href` the action also opens that page: pinning another section's peek goes to that section. */
type HeaderAction = { label: string; icon: React.ReactNode; expanded?: boolean; href?: string; onClick: () => void };

const headerButton =
  "grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94] [@media(pointer:coarse)]:size-11";

function Panel({ p, section, action }: { p: Internal; section: Section; action: HeaderAction }) {
  const Body = PANELS[section];
  const title = sectionsOf(p).find((s) => s.id === section)?.label;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 pl-2 pr-2">
        <Tooltip label={action.label} keys={["Mod", "B"]} className="shrink-0">
          {action.href ? (
            <Link href={action.href} aria-label={action.label} onClick={action.onClick} className={headerButton}>
              {action.icon}
            </Link>
          ) : (
            <button type="button" aria-label={action.label} aria-expanded={action.expanded} onClick={action.onClick} className={headerButton}>
              {action.icon}
            </button>
          )}
        </Tooltip>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em]">{title}</h2>
        {p.onOpenSearch && (
          <Tooltip label="Search" keys={["Mod", "K"]} align="end">
            <button
              type="button"
              aria-label="Search"
              onClick={() => { p.onNavigate?.(); p.onOpenSearch?.(); }}
              className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg [@media(pointer:coarse)]:size-11"
            >
              <Search className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-4 pt-1">
        <Body p={p} pillId={`sidebar-active-${p.variant}`} />
      </div>
      {p.user.isFree && (
        <div className="shrink-0 border-t border-line p-2">
          <button
            type="button"
            onClick={p.onUpgrade}
            className="group flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-2/70 [@media(pointer:coarse)]:min-h-11"
          >
            <span className="text-[12.5px] leading-snug text-muted group-hover:text-fg/80">
              <span className="font-medium text-fg">Pro</span> · more models, more room
            </span>
            <ArrowUpRight className="size-3.5 text-muted transition-transform duration-200 ease-out-soft group-hover:-translate-y-px group-hover:translate-x-px" />
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar(p: Internal): React.JSX.Element {
  const reduce = useReducedMotion();
  const peek = usePeek();
  const section = sectionOf(p.active);
  const panelIcon = <PanelLeft className="size-[18px]" />;

  if (p.variant === "drawer") {
    return (
      <aside aria-label="Sidebar" className="flex h-full w-[min(316px,90vw)] shrink-0 overflow-hidden border-r border-line bg-surface">
        <Rail p={p} section={section} peek={peek} />
        <div className="min-w-0 flex-1 border-l border-line">
          <Panel p={p} section={section} action={{ label: "Close sidebar", icon: <X className="size-[18px]" />, onClick: p.onHeaderAction }} />
        </div>
      </aside>
    );
  }

  const peekProps: Internal = {
    ...p,
    onMenuOpenChange: peek.onMenuOpenChange,
    onNavigate: () => {
      p.onNavigate?.();
      peek.close();
    },
  };

  return (
    <aside aria-label="Sidebar" className="flex h-full shrink-0 border-r border-line bg-surface">
      <Rail p={p} section={section} peek={peek} />
      <AnimatePresence initial={false}>
        {p.panelOpen && (
          <motion.div
            key="panel"
            initial={{ width: 0 }}
            animate={{ width: p.panelWidth }}
            exit={{ width: 0 }}
            transition={reduce || p.resizing ? { duration: 0 } : spring}
            className="overflow-hidden border-l border-line"
          >
            <div style={{ width: p.panelWidth }} className={cx("h-full", p.resizing && "pointer-events-none select-none")}>
              <Panel p={p} section={section} action={{ label: "Hide sidebar", icon: panelIcon, expanded: true, onClick: p.onHeaderAction }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!p.panelOpen && peek.section && (
          <motion.div
            key="peek"
            ref={peek.panel}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -10, transition: { duration: 0.16 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            style={{ width: p.panelWidth }}
            className="fixed inset-y-0 left-14 z-50 border-x border-line bg-elevated shadow-soft"
            {...peek.hoverProps}
          >
            <Panel
              p={peekProps}
              section={peek.section}
              action={{
                label: "Keep sidebar open",
                icon: panelIcon,
                expanded: false,
                href: peek.section === section ? undefined : sectionsOf(p).find((s) => s.id === peek.section)?.href,
                onClick: () => {
                  peek.close();
                  p.onHeaderAction();
                },
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
