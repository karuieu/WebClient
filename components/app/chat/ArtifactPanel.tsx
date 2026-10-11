"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Download, Printer, X } from "@/components/kit/icons";
import { Menu } from "@/components/kit/Menu";
import { Segmented } from "@/components/kit/Segmented";
import { cx } from "@/lib/cx";
import { codeTheme } from "./CodeBlock";

const WIDTH_KEY = "karui-artifact-width";
const MIN = 380;
const DEFAULT = 720;
// Previews never run scripts; same-origin is only there so the frame can be printed.
const SANDBOX = "allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox";

export type ArtifactPanelData = { title: string; document: string; streaming?: boolean };

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

function IconButton({ label, onClick, children, className }: { label: string; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94]",
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

function WritingSkeleton() {
  return (
    <Paper>
      <div className="flex h-full flex-col gap-3 p-8" aria-label="Writing document">
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

function PanelBody({
  artifact,
  onClose,
  onDownloadHtml,
  onDownloadDoc,
  mobile,
}: {
  artifact: ArtifactPanelData;
  onClose: () => void;
  onDownloadHtml: () => void;
  onDownloadDoc: () => void;
  mobile?: boolean;
}) {
  const [tab, setTab] = React.useState<"preview" | "code">("preview");
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const ready = !artifact.streaming;

  return (
    <div className="flex h-full min-w-0 flex-col bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line pl-5 pr-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium tracking-[-0.01em]">{artifact.title}</p>
          <p className={cx("font-mono text-[11px] text-muted", artifact.streaming && "text-shimmer")}>
            {artifact.streaming ? "Writing document…" : "HTML · scripts off"}
          </p>
        </div>
        <Segmented
          id={mobile ? "artifact-tab-mobile" : "artifact-tab"}
          label="View"
          size="sm"
          className="shrink-0"
          options={[
            { value: "preview", label: "Preview" },
            { value: "code", label: "Code" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="flex items-center">
          {ready && (
            <>
              <IconButton label="Print or save as PDF" onClick={() => frameRef.current?.contentWindow?.print()} className={tab === "code" ? "hidden" : undefined}>
                <Printer className="size-[17px]" />
              </IconButton>
              <Menu
                label="Download"
                placement="bottom-end"
                items={[
                  { label: "Web page", hint: ".html", onSelect: onDownloadHtml },
                  { label: "Word document", hint: ".doc", onSelect: onDownloadDoc },
                ]}
              >
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
          <IconButton label="Close" onClick={onClose}>
            <X className="size-[18px]" />
          </IconButton>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {tab === "preview" ? (
          <div className="absolute inset-0 p-3 sm:p-5">
            {ready ? (
              <Paper>
                <iframe
                  ref={frameRef}
                  title={artifact.title}
                  srcDoc={artifact.document}
                  sandbox={SANDBOX}
                  className="size-full border-0 bg-white"
                />
              </Paper>
            ) : (
              <WritingSkeleton />
            )}
          </div>
        ) : (
          <div className="absolute inset-0 overflow-auto bg-bg px-5 py-4 font-mono text-[12.5px] leading-[1.7]">
            <SyntaxHighlighter
              language="html"
              style={codeTheme}
              PreTag="div"
              showLineNumbers
              lineNumberStyle={{ color: "var(--subtle)", minWidth: "2.5em", paddingRight: "1.25em", userSelect: "none" }}
            >
              {artifact.document}
            </SyntaxHighlighter>
          </div>
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
}: {
  artifact: ArtifactPanelData | null;
  onClose: () => void;
  onDownloadHtml: () => void;
  onDownloadDoc: () => void;
}) {
  const reduce = useReducedMotion();
  const [width, setWidth] = React.useState(DEFAULT);
  const [dragging, setDragging] = React.useState(false);
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

  const common = {
    onClose,
    onDownloadHtml,
    onDownloadDoc,
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {artifact && desktop && (
          <motion.aside
            key="artifact"
            aria-label="Document"
            initial={{ width: 0 }}
            animate={{ width }}
            exit={{ width: 0 }}
            transition={reduce || dragging ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.45 }}
            className="relative h-full shrink-0 overflow-hidden border-l border-line"
          >
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
            <div className={cx("h-full", dragging && "pointer-events-none select-none")} style={{ width }}>
              <PanelBody key={artifact.title} artifact={artifact} {...common} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {artifact && !desktop && (
          <motion.div
            key="artifact-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={artifact.title}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%", transition: { type: "spring", bounce: 0, duration: 0.3 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            className="fixed inset-0 z-50 overflow-hidden pt-[env(safe-area-inset-top)]"
          >
            <PanelBody artifact={artifact} mobile {...common} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
