"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Download, Ellipsis, Expand, Printer, RotateCcw, Shrink, X } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Segmented } from "@/components/kit/Segmented";
import { useNarrow, useNow } from "@/components/kit/useMounted";
import { toDocument, type ArtifactType } from "@/lib/artifacts/artifacts";
import { cx } from "@/lib/ui/cx";
import { ShellContext } from "../AppShell";
import { exactStamp } from "../ChatsView";
import { NumberedTextArea } from "../NumberedTextArea";
import { VersionPaper, VersionPicker, versionMenuItems, type FileVersionItem, type FileVersionsProps } from "../project/FileVersions";

const WIDTH_KEY = "karui-artifact-width";
const MIN = 380;
const DEFAULT = 720;
// Narrower than this, the header controls move into ⋯.
const COMPACT_HEADER = 600;
// Besides the current one; v1, as Karui wrote it, stays too.
const VERSIONS_BACK = 3;
// Previews never run scripts; same-origin is only there so the frame can be printed.
const SANDBOX = "allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox";

/** `id` keeps each artifact's edits apart. */
export type ArtifactPanelData = { id: string; title: string; type: ArtifactType; source: string; streaming?: boolean };

function useDesktop() {
  const [desktop, setDesktop] = React.useState(true);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function maxWidth() {
  return Math.round(window.innerWidth * 0.7);
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform,opacity] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Paper({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-line [color-scheme:light]">{children}</div>
  );
}

export function DocumentPaper({ title, document, frameRef }: { title: string; document: string; frameRef?: React.Ref<HTMLIFrameElement> }) {
  return (
    <Paper>
      <iframe ref={frameRef} title={title} srcDoc={document} sandbox={SANDBOX} className="size-full border-0 bg-white" />
    </Paper>
  );
}

function WritingSkeleton({ label }: { label: string }) {
  return (
    <Paper>
      <div className="flex h-full flex-col gap-3 p-8" aria-label={label}>
        <span className="h-4 w-1/2 animate-pulse rounded-full bg-black/10" />
        <span className="mt-3 h-2.5 w-full animate-pulse rounded-full bg-black/[0.06]" />
        <span className="h-2.5 w-11/12 animate-pulse rounded-full bg-black/[0.06]" />
        <span className="h-2.5 w-4/5 animate-pulse rounded-full bg-black/[0.06]" />
        <span className="mt-4 h-2.5 w-full animate-pulse rounded-full bg-black/[0.06]" />
        <span className="h-2.5 w-2/3 animate-pulse rounded-full bg-black/[0.06]" />
      </div>
    </Paper>
  );
}

/** Downloads get what's on screen, edits included. */
type Downloads = {
  onDownloadHtml: (source: string) => void;
  onDownloadDoc: (source: string) => void;
  onDownloadMarkdown?: (source: string) => void;
  onExportGoogleDocs?: (source: string) => void;
  exportingGoogleDocs?: boolean;
};

type Version = { number: number; content: string; savedAt: string };

/** Edits are never saved: they live in the panel while the chat is open, and versions are only for going back. */
type Edits = { versions: Version[]; draft: string };

function startEdits(source: string): Edits {
  return { versions: [{ number: 1, content: source, savedAt: new Date().toISOString() }], draft: source };
}

function withVersion(edits: Edits, content: string): Edits {
  const [first, ...rest] = edits.versions;
  const current = edits.versions[edits.versions.length - 1];
  if (content === current.content) return { ...edits, draft: content };
  const next = { number: current.number + 1, content, savedAt: new Date().toISOString() };
  return { versions: [first, ...rest.slice(-VERSIONS_BACK), next], draft: content };
}

function asItem(v: Version): FileVersionItem {
  return { id: String(v.number), number: v.number, savedAt: v.savedAt, size: new Blob([v.content]).size, kept: false, hint: v.number === 1 ? "from Karui" : undefined };
}

function PanelBody({
  artifact,
  edits: saved,
  onEdits,
  onClose,
  expanded,
  onToggleExpand,
  onDownloadHtml,
  onDownloadDoc,
  onDownloadMarkdown,
  onExportGoogleDocs,
  exportingGoogleDocs,
  mobile,
}: Downloads & {
  artifact: ArtifactPanelData;
  edits?: Edits;
  onEdits: (edits: Edits) => void;
  onClose: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  mobile?: boolean;
}) {
  const [tab, setTab] = React.useState<"preview" | "edit">("preview");
  const [viewing, setViewing] = React.useState<number | null>(null);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const compact = useNarrow(rootRef, COMPACT_HEADER);
  const { sidebarHidden } = React.useContext(ShellContext);
  const now = useNow();

  const ready = !artifact.streaming;
  const note = artifact.type === "markdown";
  const writing = note ? "Writing note…" : "Writing document…";
  const edits = saved ?? startEdits(artifact.source);
  const current = edits.versions[edits.versions.length - 1];
  const shownVersion = viewing === null ? null : (edits.versions.find((v) => v.number === viewing) ?? null);
  const content = shownVersion ? shownVersion.content : edits.draft;
  const document = React.useMemo(
    () => (ready && tab === "preview" && !shownVersion ? toDocument({ title: artifact.title, type: artifact.type, content: edits.draft }) : ""),
    [ready, tab, shownVersion, artifact.title, artifact.type, edits.draft],
  );

  const commit = () => edits.draft !== current.content && onEdits(withVersion(edits, edits.draft));
  const showTab = (next: "preview" | "edit") => {
    if (next === "preview") commit();
    setTab(next);
  };

  const versions: FileVersionsProps = {
    list: [...edits.versions.slice(0, -1)].reverse().map(asItem),
    error: false,
    viewing: shownVersion && { version: asItem(shownVersion), content: shownVersion.content, error: false },
    restoring: false,
    // Unsaved typing becomes the newest version, so it's in the list.
    onLoad: commit,
    onView: (v) => {
      commit();
      setViewing(v && v.number !== current.number ? v.number : null);
      setTab("preview");
    },
    onRestore: (v) => {
      const restored = edits.versions.find((x) => x.number === v.number);
      if (restored) onEdits(withVersion(edits, restored.content));
      setViewing(null);
    },
    onDelete: () => {},
    onKeep: () => {},
  };
  const currentVersion = { number: current.number, kept: false };

  const downloads: MenuItem[] = [
    ...(note && onDownloadMarkdown ? [{ label: "Markdown", hint: ".md", onSelect: () => onDownloadMarkdown(content) }] : []),
    { label: "Web page", hint: ".html", onSelect: () => onDownloadHtml(content) },
    { label: "Word document", hint: ".doc", onSelect: () => onDownloadDoc(content) },
    ...(onExportGoogleDocs ? exportingGoogleDocs
      ? [{ type: "header" as const, content: <p role="status" className="text-[13px] text-muted">Exporting to Google Docs…</p> }]
      : [{ label: "Export to Google Docs", onSelect: () => onExportGoogleDocs(content) }] : []),
  ];
  const print = () => frameRef.current?.contentWindow?.print();
  const canPrint = ready && (tab === "preview" || !!shownVersion);
  const menuItems: MenuItem[] = [
    ...(!shownVersion
      ? [
          { type: "header" as const, content: <p className="text-label text-muted">View</p> },
          { label: "Preview", checked: tab === "preview", onSelect: () => showTab("preview") },
          { label: "Edit", checked: tab === "edit", onSelect: () => showTab("edit") },
          { type: "separator" as const },
        ]
      : []),
    ...versionMenuItems(currentVersion, false, versions, now),
    { type: "separator" },
    ...(canPrint ? [{ label: "Print or save as PDF", icon: <Printer className="size-3.5" />, onSelect: print }, { type: "separator" as const }] : []),
    { type: "header", content: <p className="text-label text-muted">Download</p> },
    ...downloads,
  ];

  const subtitle = artifact.streaming
    ? writing
    : shownVersion
      ? [`v${shownVersion.number}`, shownVersion.number === 1 ? "from Karui" : now && exactStamp(shownVersion.savedAt, now), "read only"].filter(Boolean).join(" · ")
      : [current.number > 1 || compact ? `v${current.number}` : null, note ? "Markdown" : "HTML · scripts off"].filter(Boolean).join(" · ");

  return (
    <div
      ref={rootRef}
      className="flex h-full min-w-0 flex-col bg-surface"
      onKeyDown={(e) => {
        // Escape returns to the current version before it closes the panel.
        if (e.key === "Escape" && shownVersion) {
          e.preventDefault();
          setViewing(null);
        }
      }}
    >
      <div className={cx("flex h-14 shrink-0 items-center gap-1 border-b border-line pl-5 pr-2", expanded && sidebarHidden && "md:pl-14")}>
        <div className="mr-2 min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium tracking-[-0.01em]">{artifact.title}</p>
          <p className={cx("truncate font-mono text-[11px] text-muted", artifact.streaming && "text-shimmer")}>{subtitle}</p>
        </div>
        {ready && !compact && (
          <>
            <VersionPicker current={currentVersion} canKeep={false} p={versions} />
            {!shownVersion && (
              <Segmented
                id={mobile ? "artifact-view-mobile" : "artifact-view"}
                label="View"
                size="sm"
                className="mx-1 shrink-0"
                options={[
                  { value: "preview", label: "Preview" },
                  { value: "edit", label: "Edit" },
                ]}
                value={tab}
                onChange={showTab}
              />
            )}
          </>
        )}
        {onToggleExpand && (
          <IconButton label={expanded ? "Show the chat again" : "Expand over the chat"} onClick={onToggleExpand}>
            {expanded ? <Shrink className="size-[16px]" /> : <Expand className="size-[16px]" />}
          </IconButton>
        )}
        {ready && !compact && (
          <>
            {/* Disabled rather than hidden while editing, so the header doesn't shift. */}
            <IconButton label={canPrint ? "Print or save as PDF" : "Switch to Preview to print"} onClick={print} disabled={!canPrint}>
              <Printer className="size-[17px]" />
            </IconButton>
            <Menu label="Download" placement="bottom-end" items={downloads}>
              {({ open, triggerProps }) => (
                <button
                  {...triggerProps}
                  aria-label="Download"
                  title="Download"
                  className={cx(
                    "grid size-9 cursor-pointer place-items-center rounded-full transition-[background-color,color] duration-150 hover:bg-surface-2 hover:text-fg",
                    open ? "bg-surface-2 text-fg" : "text-muted",
                  )}
                >
                  <Download className="size-[17px]" />
                </button>
              )}
            </Menu>
          </>
        )}
        {ready && compact && (
          <Menu label={`Actions for ${artifact.title}`} sheetTitle={artifact.title} items={menuItems} onOpenChange={(open) => open && commit()}>
            {({ open, triggerProps }) => (
              <button
                {...triggerProps}
                aria-label={`Actions for ${artifact.title}`}
                className={cx(
                  "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
                  open && "bg-surface-2 text-fg",
                )}
              >
                <Ellipsis />
              </button>
            )}
          </Menu>
        )}
        {shownVersion && (
          <button
            type="button"
            onClick={() => versions.onRestore(asItem(shownVersion))}
            title={`Makes v${shownVersion.number} the newest version, v${current.number + 1}`}
            className="ml-1 flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-inverse px-3 text-[12.5px] font-medium text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97]"
          >
            <RotateCcw className="size-3" />
            Restore
          </button>
        )}
        <IconButton label="Close" onClick={onClose}>
          <X className="size-[18px]" />
        </IconButton>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {!ready ? (
          <div className="absolute inset-0 p-3 sm:p-5">
            <WritingSkeleton label={writing} />
          </div>
        ) : shownVersion && versions.viewing ? (
          <VersionPaper name={artifact.title} type={artifact.type} viewing={versions.viewing} onRetry={() => {}} frameRef={frameRef} />
        ) : tab === "preview" ? (
          <div className="absolute inset-0 p-3 sm:p-5">
            <DocumentPaper title={artifact.title} document={document} frameRef={frameRef} />
          </div>
        ) : (
          <NumberedTextArea
            label={`${note ? "Markdown" : "HTML"} of ${artifact.title}`}
            value={edits.draft}
            spellCheck={note}
            onChange={(draft) => onEdits({ ...edits, draft })}
          />
        )}
      </div>
    </div>
  );
}

export function ArtifactPanel({
  artifact,
  onClose,
  onDownloadHtml,
  onDownloadDoc,
  onDownloadMarkdown,
  onExportGoogleDocs,
  exportingGoogleDocs,
}: Downloads & {
  artifact: ArtifactPanelData | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [width, setWidth] = React.useState(DEFAULT);
  const [dragging, setDragging] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  // Held here, not in the body, so closing the panel keeps them.
  const [edits, setEdits] = React.useState<Record<string, Edits>>({});
  const desktop = useDesktop();

  React.useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      if (saved) setWidth(Math.min(Math.max(saved, MIN), maxWidth()));
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!artifact) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [artifact, onClose]);

  const open = !!artifact;
  React.useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  const commit = (w: number) => {
    const clamped = Math.min(Math.max(w, MIN), maxWidth());
    setWidth(clamped);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {}
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startW = width;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (m: PointerEvent) => setWidth(Math.min(Math.max(startW + (startX - m.clientX), MIN), maxWidth()));
    const up = (u: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      setDragging(false);
      commit(startW + (startX - u.clientX));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  const common = artifact && {
    artifact,
    edits: edits[artifact.id],
    onEdits: (next: Edits) => setEdits((all) => ({ ...all, [artifact.id]: next })),
    onClose,
    onDownloadHtml,
    onDownloadDoc,
    onDownloadMarkdown,
    onExportGoogleDocs,
    exportingGoogleDocs,
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {common && desktop && (
          <motion.aside
            key="artifact"
            aria-label="Document"
            initial={{ width: 0 }}
            // 100% rather than a measured width, so it follows the sliding sidebar in the same frame.
            animate={{ width: expanded ? "100%" : width }}
            exit={{ width: 0 }}
            transition={reduce || dragging ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.45 }}
            className={cx("relative h-full shrink-0 overflow-hidden", !expanded && "border-l border-line")}
          >
            {!expanded && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize document panel"
                aria-valuenow={width}
                aria-valuemin={MIN}
                tabIndex={0}
                title="Drag to resize · double-click to reset"
                onPointerDown={startDrag}
                onDoubleClick={() => commit(DEFAULT)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") commit(width + 32);
                  if (e.key === "ArrowRight") commit(width - 32);
                }}
                className="group absolute inset-y-0 left-0 z-10 w-2 -translate-x-1 cursor-col-resize touch-none"
              >
                <span
                  className={cx(
                    "absolute inset-y-0 left-1 w-px transition-[background-color,width] duration-150",
                    dragging ? "w-0.5 bg-fg/40" : "group-hover:w-0.5 group-hover:bg-fg/25 group-focus-visible:bg-fg/40",
                  )}
                />
              </div>
            )}
            <div className={cx("h-full", dragging && "pointer-events-none select-none")} style={{ width: expanded ? "100%" : width }}>
              <PanelBody key={common.artifact.id} {...common} expanded={expanded} onToggleExpand={() => setExpanded((x) => !x)} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {common && !desktop && (
          <motion.div
            key="artifact-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={common.artifact.title}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%", transition: { type: "spring", bounce: 0, duration: 0.3 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            className="fixed inset-0 z-50 overflow-hidden pt-[env(safe-area-inset-top)]"
          >
            <PanelBody key={common.artifact.id} {...common} mobile />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
