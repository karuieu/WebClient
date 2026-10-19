"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ChevronRight,
  Ellipsis,
  Expand,
  FileCode,
  FileText,
  Folder,
  FolderInput,
  FolderMinus,
  Layers,
  NotebookText,
  PanelRight,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Shrink,
  Star,
  Trash,
  X,
} from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Segmented } from "@/components/kit/Segmented";
import { Spinner } from "@/components/kit/Spinner";
import { useNarrow, useNow } from "@/components/kit/useMounted";
import { Tooltip } from "@/components/kit/Tooltip";
import { artifactTypeOf, toDocument } from "@/lib/artifacts";
import { cx } from "@/lib/cx";
import { exactStamp, groupOf, stamp } from "../ChatsView";
import { DocumentPaper } from "../chat/ArtifactPanel";
import { ShellContext } from "../AppShell";
import { DropOverlay } from "../DropOverlay";
import { NumberedTextArea } from "../NumberedTextArea";
import { VersionPaper, VersionPicker, versionMenuItems, type FileVersionsProps } from "./FileVersions";
import { AddButtons, UsageMeter, formatBytes, type LibraryFile, type LibraryMemoryFile, type LibraryUsage } from "./Library";
import type { YouMode } from "./ProjectSettings";

export type PanelChat = { id: string; title: string; brief?: string; starred: boolean; updatedAt: string };
export type PanelView = "chats" | "library";

export type OpenLibraryItem =
  | {
      kind: "file";
      file: LibraryFile;
      content: string | null;
      error?: string | null;
      /** Bumped when the content is replaced from outside the editor (a restored version), which starts the editor afresh. */
      revision?: number;
    }
  | { kind: "memory"; file: LibraryMemoryFile };

export type ProjectPanelProps = {
  error?: { message: string; onRetry: () => void } | null;
  view: PanelView;
  onView: (v: PanelView) => void;
  chats: PanelChat[] | null;
  activeChatId?: string | null;
  newChatHref: string;
  chatHref: (id: string) => string;
  chatActions: {
    onStar: (c: PanelChat) => void;
    onRename: (c: PanelChat, title: string) => void;
    onRemove: (c: PanelChat) => void;
    onDelete: (c: PanelChat) => void;
    onAddExisting: () => void;
  };
  library: {
    memory: LibraryMemoryFile[] | null;
    memoryOn: boolean;
    you: YouMode;
    files: LibraryFile[] | null;
    usage: LibraryUsage | null;
    uploading?: { done: number; total: number } | null;
    open: OpenLibraryItem | null;
    saving?: boolean;
    onOpenMemoryFile: (f: LibraryMemoryFile) => void;
    onAddMemoryFile: (name: string) => void;
    onSaveMemoryFile: (id: string, patch: { name: string; description: string; content: string }) => void;
    onDeleteMemoryFile: (f: LibraryMemoryFile) => void;
    onMemorySettings: () => void;
    onOpenFile: (f: LibraryFile) => void;
    onSaveFile: (id: string, content: string) => void;
    versions?: FileVersionsProps;
    onRetryOpen: () => void;
    onCloseItem: () => void;

    onDeleteFiles: (ids: string[], label: string) => void;
    onAddFiles: (files: File[]) => void;
    onAddFolder: (files: File[]) => void;
    onDropData?: (data: DataTransfer) => void;
  };
};

type Internal = ProjectPanelProps & {
  variant: "docked" | "drawer";
  width?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onClose: () => void;
  onNavigate?: () => void;
};

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

function ActivePill({ id }: { id: string }) {
  return <motion.span layoutId={id} transition={spring} className="absolute inset-0 rounded-xl bg-elevated shadow-soft ring-1 ring-line" />;
}

function RowMenu({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  return (
    <Menu label={label} items={items} className={cx("absolute right-1", className)}>
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

function ChatItem({ chat, active, p, now }: { chat: PanelChat; active: boolean; p: Internal; now: Date | null }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(chat.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== chat.title) p.chatActions.onRename(chat, t);
    else setDraft(chat.title);
  };

  const items: MenuItem[] = [
    { label: chat.starred ? "Unstar" : "Star", icon: <Star filled={chat.starred} className="size-3.5" />, onSelect: () => p.chatActions.onStar(chat) },
    {
      label: "Rename",
      icon: <Pencil className="size-3.5" />,
      onSelect: () => {
        setDraft(chat.title);
        setEditing(true);
      },
    },
    { label: "Remove from project", icon: <FolderMinus className="size-3.5" />, onSelect: () => p.chatActions.onRemove(chat) },
    { type: "separator" },
    { label: "Delete", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => p.chatActions.onDelete(chat) },
  ];

  if (editing)
    return (
      <li className="rounded-xl bg-elevated px-3 py-2 ring-1 ring-line-strong">
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
          className="h-6 w-full bg-transparent text-[13.5px] tracking-[-0.01em] outline-none"
        />
      </li>
    );

  return (
    <li className="group/row relative">
      <Link
        href={p.chatHref(chat.id)}
        onClick={p.onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "relative block rounded-xl py-2.5 pl-3 pr-9 transition-colors duration-150",
          active ? "text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg",
        )}
      >
        {active && <ActivePill id={`project-panel-active-${p.variant}`} />}
        <span className="relative flex items-center gap-1.5">
          {chat.starred && <Star filled className="size-3 shrink-0" />}
          <span className={cx("min-w-0 flex-1 truncate text-[13.5px] tracking-[-0.01em]", active ? "text-fg" : "text-fg/90")}>{chat.title}</span>
        </span>
        {chat.brief && <span className="relative mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{chat.brief}</span>}
        <span className="relative mt-1 block font-mono text-[11px] text-muted">{now ? stamp(chat.updatedAt, now) : " "}</span>
      </Link>
      <RowMenu label={`Actions for ${chat.title}`} items={items} className="top-2" />
    </li>
  );
}

function ChatsList(p: Internal) {
  const now = useNow();
  const onNew = !p.activeChatId;
  const groups = React.useMemo(() => {
    const map = new Map<string, PanelChat[]>();
    const sorted = [...(p.chats ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const c of sorted) {
      const g = now ? groupOf(c.updatedAt, now) : "\u00a0";
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return [...map.entries()];
  }, [p.chats, now]);
  return (
    <div className="flex flex-col gap-0.5 px-3 pb-4">
      <Link
        href={p.newChatHref}
        onClick={p.onNavigate}
        aria-current={onNew ? "page" : undefined}
        className={cx(
          "relative mb-2 flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] tracking-[-0.01em] transition-colors duration-150",
          onNew ? "text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg",
        )}
      >
        {onNew && <ActivePill id={`project-panel-active-${p.variant}`} />}
        <Plus className="relative size-4" />
        <span className="relative">New chat</span>
      </Link>

      {p.chats === null ? (
        <ul aria-label="Loading chats" className="flex flex-col gap-3 px-3 pt-1">
          {[70, 85, 60, 78].map((w, i) => (
            <li key={i} className="flex flex-col gap-1.5">
              <span className="h-2.5 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
              <span className="h-2 animate-pulse rounded-full bg-surface-2/70" style={{ width: `${w - 25}%` }} />
            </li>
          ))}
        </ul>
      ) : p.chats.length === 0 ? (
        <p className="px-3 text-[13px] leading-relaxed text-muted">Chats you start here show up in this list, each with a line on what it&apos;s about.</p>
      ) : (
        groups.map(([group, items]) => (
          <section key={group} className="mt-4 first-of-type:mt-1">
            <h3 className="text-label px-3 pb-1.5 text-fg/80">{group}</h3>
            <ul className="flex flex-col gap-0.5">
              {items.map((c) => (
                <ChatItem key={c.id} chat={c} active={p.activeChatId === c.id} p={p} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}

      {p.chats !== null && (
        <button
          type="button"
          onClick={p.chatActions.onAddExisting}
          className="mt-2 flex h-9 cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[13px] text-muted transition-colors duration-150 hover:bg-surface-2/70 hover:text-fg"
        >
          <FolderInput className="size-4" />
          Add existing chats
        </button>
      )}
    </div>
  );
}

type TreeNode = { name: string; path: string; folders: TreeNode[]; files: LibraryFile[] };

function buildTree(files: LibraryFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", folders: [], files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${part}` : part;
      let next = node.folders.find((n) => n.name === part);
      if (!next) {
        next = { name: part, path, folders: [], files: [] };
        node.folders.push(next);
      }
      node = next;
    }
    node.files.push(f);
  }
  const sort = (n: TreeNode) => {
    n.folders.sort((a, b) => a.name.localeCompare(b.name));
    n.files.sort((a, b) => a.path.localeCompare(b.path));
    n.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function allFiles(n: TreeNode): LibraryFile[] {
  return [...n.files, ...n.folders.flatMap(allFiles)];
}

const indent = (depth: number) => ({ paddingLeft: `${12 + depth * 14}px` });

const FILE_ICON = { markdown: NotebookText, html: FileCode } as const;

function FileRow({ file, depth, p }: { file: LibraryFile; depth: number; p: Internal }) {
  const name = file.path.split("/").pop() ?? file.path;
  const type = artifactTypeOf(file.path);
  const Icon = type ? FILE_ICON[type] : FileText;
  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => p.library.onOpenFile(file)}
        style={indent(depth)}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg pr-9 text-left text-[13px] tracking-[-0.01em] text-fg/90 transition-colors duration-150 hover:bg-surface-2/70"
      >
        <Icon className="size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted [@media(hover:hover)]:group-hover/row:opacity-0">{formatBytes(file.size)}</span>
      </button>
      <RowMenu
        label={`Actions for ${name}`}
        className="top-0.5"
        items={[
          { label: "Open", icon: <Pencil className="size-3.5" />, onSelect: () => p.library.onOpenFile(file) },
          { type: "separator" },
          { label: "Delete", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => p.library.onDeleteFiles([file.id], name) },
        ]}
      />
    </li>
  );
}

function FolderNode({ node, depth, p }: { node: TreeNode; depth: number; p: Internal }) {
  const [open, setOpen] = React.useState(depth === 0 && node.folders.length + node.files.length <= 8);
  const files = allFiles(node);
  return (
    <li>
      <div className="group/row relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={indent(depth)}
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg pr-9 text-left text-[13px] tracking-[-0.01em] text-fg/90 transition-colors duration-150 hover:bg-surface-2/70"
        >
          <ChevronRight className={cx("-ml-0.5 size-3 shrink-0 text-muted transition-transform duration-300 ease-out-soft", open && "rotate-90")} />
          <Folder className="size-3.5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted [@media(hover:hover)]:group-hover/row:opacity-0">{files.length}</span>
        </button>
        <RowMenu
          label={`Actions for ${node.name}`}
          className="top-0.5"
          items={[
            {
              label: "Delete folder",
              icon: <Trash className="size-3.5" />,
              danger: true,
              onSelect: () => p.library.onDeleteFiles(files.map((f) => f.id), `${node.name}/`),
            },
          ]}
        />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <TreeItems node={node} depth={depth + 1} p={p} />
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function TreeItems({ node, depth, p }: { node: TreeNode; depth: number; p: Internal }) {
  return (
    <>
      {node.folders.map((f) => (
        <FolderNode key={f.path} node={f} depth={depth} p={p} />
      ))}
      {node.files.map((f) => (
        <FileRow key={f.id} file={f} depth={depth} p={p} />
      ))}
    </>
  );
}

function MemoryFolder({ p }: { p: Internal }) {
  const { library: l } = p;
  const [open, setOpen] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const count = (l.memory?.length ?? 0) + (l.you === "live" ? 1 : 0);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={indent(0)}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg pr-3 text-left text-[13px] font-medium tracking-[-0.01em] transition-colors duration-150 hover:bg-surface-2/70"
      >
        <ChevronRight className={cx("-ml-0.5 size-3 shrink-0 text-muted transition-transform duration-300 ease-out-soft", open && "rotate-90")} />
        <Layers className="size-3.5 shrink-0 text-muted" />
        <span className="flex-1">Memory</span>
        {l.memoryOn ? (
          <span className="font-mono text-[10.5px] font-normal tabular-nums text-muted">{count}</span>
        ) : (
          <span className="font-mono text-[10.5px] font-normal text-muted">off</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            {!l.memoryOn ? (
              <li style={indent(1)} className="py-1.5 pr-3 text-[12.5px] leading-relaxed text-muted">
                Project memory is off.{" "}
                <button type="button" onClick={l.onMemorySettings} className="cursor-pointer text-fg underline underline-offset-2">
                  Turn it on
                </button>
              </li>
            ) : l.memory === null ? (
              <li style={indent(1)} className="flex h-8 items-center pr-3">
                <span className="h-2.5 w-2/3 animate-pulse rounded-full bg-surface-2" />
              </li>
            ) : (
              <>
                {l.you === "live" && (
                  <li>
                    <button
                      type="button"
                      onClick={l.onMemorySettings}
                      style={indent(1)}
                      title="Read live from your memory. Change it in project settings."
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg pr-3 text-left text-[13px] tracking-[-0.01em] text-fg/90 transition-colors duration-150 hover:bg-surface-2/70"
                    >
                      <Folder className="size-3.5 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">You</span>
                      <span className="shrink-0 font-mono text-[10.5px] text-muted">live · read only</span>
                    </button>
                  </li>
                )}
                {l.memory.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => l.onOpenMemoryFile(f)}
                      style={indent(1)}
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg pr-3 text-left text-[13px] tracking-[-0.01em] text-fg/90 transition-colors duration-150 hover:bg-surface-2/70"
                    >
                      <FileText className="size-3.5 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      {f.fromYou && <span className="shrink-0 font-mono text-[10.5px] text-muted">from You</span>}
                    </button>
                  </li>
                ))}
                {l.memory.length === 0 && l.you !== "live" && (
                  <li style={indent(1)} className="py-1.5 pr-3 text-[12.5px] leading-relaxed text-muted">
                    Fills in as you chat here.
                  </li>
                )}
                <li style={indent(1)} className="pr-1">
                  {adding ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim()) return;
                        l.onAddMemoryFile(name.trim());
                        setName("");
                        setAdding(false);
                      }}
                    >
                      <input
                        autoFocus
                        data-focus="within"
                        aria-label="New memory file name"
                        value={name}
                        placeholder="File name, e.g. Deadlines"
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => !name.trim() && setAdding(false)}
                        onKeyDown={(e) => e.key === "Escape" && (setName(""), setAdding(false))}
                        className="my-0.5 h-8 w-full rounded-lg bg-elevated px-2.5 text-[13px] outline-none ring-1 ring-line-strong placeholder:text-subtle"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg text-left text-[12.5px] text-muted transition-colors duration-150 hover:text-fg"
                    >
                      <Plus className="size-3.5" />
                      Add memory file
                    </button>
                  )}
                </li>
              </>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function LibraryView(p: Internal) {
  const { library: l } = p;
  const [dropping, setDropping] = React.useState(false);
  const tree = React.useMemo(() => (l.files ? buildTree(l.files) : null), [l.files]);

  return (
    <div
      className="relative flex min-h-full flex-col"
      onDragOver={(e) => {
        if (!l.onDropData) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!l.onDropData) return;
        e.preventDefault();
        setDropping(false);
        l.onDropData(e.dataTransfer);
      }}
    >
      <ul className="flex flex-col gap-px px-3">
        <MemoryFolder p={p} />
      </ul>

      <h3 className="text-label mt-6 px-6 pb-2 text-fg/80">Files</h3>
      {tree === null ? (
        <ul aria-label="Loading files" className="flex flex-col gap-3 px-6 pt-1">
          {[64, 80, 52].map((w, i) => (
            <li key={i} className="h-2.5 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
          ))}
        </ul>
      ) : tree.folders.length + tree.files.length === 0 ? (
        <p className="px-6 text-[13px] leading-relaxed text-muted">
          Nothing here yet. Add notes, papers or a code folder, and each chat reads what it needs.
        </p>
      ) : (
        <ul className="flex flex-col gap-px px-3">
          <TreeItems node={tree} depth={0} p={p} />
        </ul>
      )}

      {l.uploading && (
        <div className="mx-6 mt-4 flex items-center gap-2.5 text-[12.5px] text-muted" role="status">
          <Spinner className="size-3.5" />
          Encrypting and adding {l.uploading.done} of {l.uploading.total}…
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 px-6 pb-4">
        <AddButtons onAddFiles={l.onAddFiles} onAddFolder={l.onAddFolder} disabled={!!l.uploading} size="sm" />
      </div>

      <DropOverlay active={dropping} label="Drop to add to the Library" note="Text, code and PDF" />
    </div>
  );
}

// Narrower than this, the version picker and Preview / Edit move into ⋯.
const COMPACT_HEADER = 520;

const smallButton =
  "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-[opacity,background-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

/** Key the editor by file and loaded content so opening a file initializes the correct draft. */
function LibraryEditor({ item, p }: { item: OpenLibraryItem; p: Internal }) {
  const l = p.library;
  const memory = item.kind === "memory" ? item.file : null;
  const [draft, setDraft] = React.useState(
    memory ? { name: memory.name, description: memory.description, content: memory.content } : { name: "", description: "", content: item.kind === "file" ? (item.content ?? "") : "" },
  );
  const [leaving, setLeaving] = React.useState(false);

  const dirty = memory
    ? draft.name !== memory.name || draft.description !== memory.description || draft.content !== memory.content
    : item.kind === "file" && item.content !== null && draft.content !== item.content;

  const save = () => {
    if (!dirty || l.saving) return;
    if (memory) l.onSaveMemoryFile(memory.id, { ...draft, name: draft.name.trim() || memory.name });
    else l.onSaveFile(item.file.id, draft.content);
  };
  const back = () => (dirty ? setLeaving(true) : l.onCloseItem());

  const name = memory ? draft.name || "Untitled" : (item.file as LibraryFile).path.split("/").pop();
  const folder = memory ? null : (item.file as LibraryFile).path.split("/").slice(0, -1).join("/");
  const pdf = !memory && (item.file as LibraryFile).path.toLowerCase().endsWith(".pdf");
  const subtitle = memory
    ? memory.fromYou
      ? "Memory · copied from You"
      : "Memory"
    : [folder, formatBytes((item.file as LibraryFile).size), pdf && "text from the PDF"].filter(Boolean).join(" · ");

  const field = "w-full bg-transparent outline-none transition-colors duration-150 placeholder:text-subtle focus:bg-elevated";

  const type = memory ? null : artifactTypeOf((item.file as LibraryFile).path);
  const [view, setView] = React.useState<"preview" | "edit">(type ? "preview" : "edit");
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const loaded = item.kind === "file" && item.content !== null && !item.error;
  const previewing = type !== null && view === "preview" && loaded;
  const document = React.useMemo(
    () => (previewing ? toDocument({ title: name ?? "", type, content: draft.content }) : ""),
    [previewing, type, name, draft.content],
  );
  const versions = type && loaded ? l.versions : undefined;
  const viewing = versions?.viewing ?? null;
  const file = item.kind === "file" ? item.file : null;
  const current = { number: file?.version ?? 1, kept: !!file?.kept };

  const rootRef = React.useRef<HTMLDivElement>(null);
  const compact = useNarrow(rootRef, COMPACT_HEADER);
  const { sidebarHidden } = React.useContext(ShellContext);
  const now = useNow();
  const toolbar = type !== null && loaded;
  const menuItems: MenuItem[] = [
    ...(toolbar && compact && !viewing
      ? [
          { type: "header" as const, content: <p className="text-label text-muted">View</p> },
          { label: "Preview", checked: view === "preview", onSelect: () => setView("preview") },
          { label: "Edit", checked: view === "edit", onSelect: () => setView("edit") },
          { type: "separator" as const },
        ]
      : []),
    ...(compact && versions ? [...versionMenuItems(current, !dirty, versions, now), { type: "separator" as const }] : []),
    ...(previewing || viewing
      ? [
          { label: "Print or save as PDF", icon: <Printer className="size-3.5" />, onSelect: () => frameRef.current?.contentWindow?.print() },
          { type: "separator" as const },
        ]
      : []),
    ...(viewing && versions
      ? [{ label: `Delete v${viewing.version.number}`, icon: <Trash className="size-3.5" />, danger: true, onSelect: () => versions.onDelete(viewing.version) }]
      : []),
    {
      label: "Delete file",
      icon: <Trash className="size-3.5" />,
      danger: true,
      onSelect: () => (memory ? l.onDeleteMemoryFile(memory) : l.onDeleteFiles([item.file.id], name ?? "")),
    },
  ];
  const shownSubtitle = viewing
    ? [`v${viewing.version.number}`, now && exactStamp(viewing.version.savedAt, now), "read only"].filter(Boolean).join(" · ")
    : toolbar && compact
      ? `v${current.number} · ${subtitle}`
      : subtitle;

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          save();
        }
        if (e.key !== "Escape") return;
        if (viewing) versions?.onView(null);
        else if (!dirty) l.onCloseItem();
      }}
    >
      <div
        className={cx(
          "flex shrink-0 items-center gap-1 border-line pl-2 pr-3 md:pr-4",
          // Over the chat: the chat header's height, and room for the floating button of a hidden sidebar.
          p.expanded ? "h-14 border-b" : "h-12 border-y",
          p.expanded && sidebarHidden && "md:pl-14",
        )}
      >
        <button
          type="button"
          onClick={back}
          aria-label="Back to Library"
          title="Back to Library"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <p className="flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.01em]">
            <span className="truncate">{name}</span>
            {dirty && <span className="size-1.5 shrink-0 rounded-full bg-fg" aria-label="Unsaved changes" />}
          </p>
          <p className="truncate font-mono text-[10.5px] text-muted" title={shownSubtitle}>
            {shownSubtitle}
          </p>
        </div>
        {toolbar && !compact && (
          <>
            {versions && <VersionPicker current={current} canKeep={!dirty} p={versions} />}
            {!viewing && (
              <Segmented
                id={`library-view-${p.variant}`}
                label="View"
                size="sm"
                className="mx-1 shrink-0"
                options={[
                  { value: "preview", label: "Preview" },
                  { value: "edit", label: "Edit" },
                ]}
                value={view}
                onChange={setView}
              />
            )}
          </>
        )}
        {p.onToggleExpand && (
          <button
            type="button"
            onClick={p.onToggleExpand}
            aria-label={p.expanded ? "Show the chat again" : "Expand over the chat"}
            title={p.expanded ? "Show the chat again" : "Expand over the chat"}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg max-md:hidden"
          >
            {p.expanded ? <Shrink className="size-3.5" /> : <Expand className="size-3.5" />}
          </button>
        )}
        <Menu
          label={`Actions for ${name}`}
          sheetTitle={name ?? "File"}
          items={menuItems}
          onOpenChange={(open) => open && compact && versions?.onLoad()}
        >
          {({ open, triggerProps }) => (
            <button
              {...triggerProps}
              aria-label={`Actions for ${name}`}
              className={cx(
                "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
                open && "bg-surface-2 text-fg",
              )}
            >
              <Ellipsis />
            </button>
          )}
        </Menu>
        {viewing && versions ? (
          <button
            type="button"
            onClick={() => versions.onRestore(viewing.version)}
            disabled={viewing.content === null || versions.restoring}
            title={`Makes v${viewing.version.number} the newest version, v${current.number + 1}`}
            className={cx(smallButton, "ml-1 bg-inverse text-on-inverse hover:opacity-85")}
          >
            {versions.restoring ? <Spinner inverse className="size-3" /> : <RotateCcw className="size-3" />}
            Restore
          </button>
        ) : (
          <Tooltip keys={["Mod", "S"]} align="end" className="ml-1">
            <button type="button" onClick={save} disabled={!dirty} className={cx(smallButton, "bg-inverse text-on-inverse hover:opacity-85")}>
              {l.saving && <Spinner inverse className="size-3" />}
              Save
            </button>
          </Tooltip>
        )}
      </div>

      <AnimatePresence initial={false}>
        {leaving && (
          <motion.div
            role="alert"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="shrink-0 overflow-hidden border-b border-line bg-elevated"
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <p className="min-w-0 flex-1 text-[12.5px] text-muted">This file has changes you haven&apos;t saved.</p>
              <button type="button" onClick={l.onCloseItem} className={cx(smallButton, "text-danger hover:bg-danger/10")}>
                Discard
              </button>
              <button
                type="button"
                onClick={() => {
                  save();
                  l.onCloseItem();
                }}
                className={cx(smallButton, "bg-inverse text-on-inverse hover:opacity-85")}
              >
                Save and close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {memory ? (
        <>
          <input
            data-focus="within"
            aria-label="File name"
            value={draft.name}
            placeholder="File name"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className={cx(field, "h-11 shrink-0 border-b border-line px-4 text-[14px] font-medium tracking-[-0.01em]")}
          />
          <input
            data-focus="within"
            aria-label="What this file is for"
            value={draft.description}
            placeholder="What this file is for"
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className={cx(field, "h-10 shrink-0 border-b border-line px-4 text-[13px] text-muted")}
          />
          <NumberedTextArea
            label="Content"
            value={draft.content}
            placeholder="What Karui should remember here"
            onChange={(content) => setDraft((d) => ({ ...d, content }))}
          />
        </>
      ) : item.kind === "file" && item.error ? (
        <div className="px-6 pt-5" role="alert">
          <p className="text-[13px] leading-relaxed text-muted">{item.error}</p>
          <button type="button" onClick={l.onRetryOpen} className={cx(smallButton, "mt-3 text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2/70")}>
            Try again
          </button>
        </div>
      ) : item.kind === "file" && item.content === null ? (
        <div className="flex flex-col gap-2.5 px-4 pt-4" aria-label="Opening file">
          {[92, 78, 85, 60, 88, 40, 70].map((w, i) => (
            <span key={i} className="h-2.5 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : type && viewing ? (
        <VersionPaper name={name ?? ""} type={type} viewing={viewing} onRetry={() => versions?.onView(viewing.version)} frameRef={frameRef} />
      ) : previewing ? (
        <div className="min-h-0 flex-1 p-3">
          <DocumentPaper title={name ?? ""} document={document} frameRef={frameRef} />
        </div>
      ) : (
        <NumberedTextArea
          label={`Content of ${name}`}
          value={draft.content}
          spellCheck={type === "markdown"}
          onChange={(content) => setDraft((d) => ({ ...d, content }))}
        />
      )}

    </div>
  );
}

export function ProjectPanel(p: Internal) {
  const usage = p.library.usage;
  const editing = p.view === "library" && !p.error ? p.library.open : null;
  return (
    <aside
      aria-label="Project"
      style={p.variant === "docked" ? { width: p.width } : undefined}
      className={cx(
        "flex h-full shrink-0 flex-col overflow-hidden bg-surface",
        p.variant === "docked" ? "border-l border-line" : editing ? "w-screen" : "w-[min(400px,90vw)]",
      )}
    >
      <div className={cx("flex h-14 shrink-0 items-center justify-between gap-2 pl-4 pr-3 md:pr-4", p.expanded && editing && "hidden")}>
        <Segmented
          id={`project-panel-view-${p.variant}`}
          label="Show"
          size="sm"
          className="w-[11.5rem]"
          options={[
            { value: "chats", label: "Chats" },
            { value: "library", label: "Library" },
          ]}
          value={p.view}
          onChange={p.onView}
        />
        <button
          type="button"
          onClick={p.onClose}
          aria-label={p.variant === "docked" ? "Hide project panel" : "Close project panel"}
          title={p.variant === "docked" ? "Hide project panel" : "Close project panel"}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94]"
        >
          {p.variant === "docked" ? <PanelRight className="size-[18px]" /> : <X className="size-[18px]" />}
        </button>
      </div>

      {editing ? (
        <LibraryEditor
          key={`${editing.kind}-${editing.file.id}-${editing.kind === "file" && editing.content !== null}-${editing.kind === "file" ? (editing.revision ?? 0) : 0}`}
          item={editing}
          p={p}
        />
      ) : (
      <div className="relative min-h-0 flex-1">
        {/* overflow-x-hidden: the view entering from 10px right would flash a horizontal scrollbar. */}
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain pt-2 [mask-image:linear-gradient(to_bottom,transparent,black_10px,black_calc(100%-20px),transparent)]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={p.view}
              initial={{ opacity: 0, x: p.view === "library" ? 10 : -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={spring}
              className="min-h-full"
            >
              {p.error ? (
                <div className="px-6 pt-4" role="alert">
                  <p className="text-[13px] leading-relaxed text-muted">{p.error.message}</p>
                  <button
                    type="button"
                    onClick={p.error.onRetry}
                    className="mt-3 flex h-8 cursor-pointer items-center rounded-full px-3 text-[12.5px] text-fg ring-1 ring-inset ring-line-strong transition-colors duration-150 hover:bg-surface-2/70"
                  >
                    Try again
                  </button>
                </div>
              ) : p.view === "chats" ? (
                <ChatsList {...p} />
              ) : (
                <LibraryView {...p} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      )}

      {p.view === "library" && usage && !p.error && !editing && (
        <div className="shrink-0 border-t border-line px-5 py-3.5">
          <UsageMeter usage={usage} />
        </div>
      )}
    </aside>
  );
}

