"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useModalFocus } from "@/components/kit/Dialog";
import { ChevronLeft, ChevronRight, FileText, X } from "@/components/kit/icons";
import { useMounted } from "@/components/kit/useMounted";
import { cx } from "@/lib/ui/cx";

export type ViewerAttachment =
  | { kind: "image"; name: string; src: string }
  | { kind: "file"; name: string; content: string; meta?: string };

const PROSE_FILE = /\.(txt|md|markdown)$/i;

const darkControl =
  "grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-[background-color,opacity] duration-150 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-30";

function lineCount(content: string): string {
  const n = content ? content.replace(/\n$/, "").split("\n").length : 0;
  return n === 1 ? "1 line" : `${n} lines`;
}

export function FileTile({ name, content, meta, small }: { name: string; content: string; meta?: string; small?: boolean }) {
  const dot = name.lastIndexOf(".");
  const type = dot > 0 ? name.slice(dot + 1) : null;
  const base = type ? name.slice(0, dot) : name;
  const badge = type && (
    <span className="max-w-full self-start truncate rounded-full border border-line-strong px-1.5 py-px text-[10px] font-medium uppercase leading-4 tracking-[0.02em] text-muted">
      {type}
    </span>
  );

  if (small)
    return (
      <span title={name} className="flex size-16 flex-col justify-between rounded-xl border border-line bg-surface p-1.5 text-left">
        <span className="line-clamp-2 break-all text-[10px] leading-tight">{base}</span>
        {badge}
      </span>
    );
  return (
    <span title={name} className="flex size-28 flex-col justify-between rounded-2xl border border-line bg-surface p-3 text-left">
      <span className="min-w-0">
        <span className="block truncate text-[13px] leading-snug">{base}</span>
        <span className="mt-0.5 block text-[11px] text-muted">{lineCount(content)}</span>
        {meta && <span className="block text-[11px] text-muted">{meta}</span>}
      </span>
      {badge}
    </span>
  );
}

/** Arrows step through the images only; a text file opens on its own. */
export function AttachmentViewer({
  attachments,
  index,
  onIndexChange,
  onClose,
}: {
  attachments: ViewerAttachment[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const mounted = useMounted();
  const reduce = useReducedMotion();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const current = index === null ? undefined : attachments[index];
  const trapTab = useModalFocus(!!current, panelRef);

  const images = attachments.flatMap((a, i) => (a.kind === "image" ? [i] : []));
  const position = index === null ? -1 : images.indexOf(index);
  const prev = images[position - 1];
  const next = images[position + 1];

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = current?.kind !== "image" ? undefined : e.key === "ArrowLeft" ? prev : e.key === "ArrowRight" ? next : undefined;
    if (e.key === "Escape") onClose();
    else if (step !== undefined) onIndexChange(step);
    else return trapTab(e);
    e.preventDefault();
    e.stopPropagation();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {current && (
        <div key="viewer" className="fixed inset-0 z-[80] flex items-center justify-center font-sans" onKeyDown={onKeyDown}>
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className={cx("absolute inset-0", current.kind === "image" ? "bg-black/90" : "bg-black/40 backdrop-blur-[3px]")}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={current.name}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, transition: { duration: 0.16 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className={current.kind === "image" ? "pointer-events-none absolute inset-0 flex flex-col" : "relative"}
          >
            {current.kind === "image" ? (
              <ImageView
                image={current}
                imageKey={index ?? 0}
                counter={images.length > 1 ? { position, count: images.length } : null}
                onPrev={prev === undefined ? undefined : () => onIndexChange(prev)}
                onNext={next === undefined ? undefined : () => onIndexChange(next)}
                onClose={onClose}
              />
            ) : (
              <FileView file={current} onClose={onClose} />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ImageView({
  image,
  imageKey,
  counter,
  onPrev,
  onNext,
  onClose,
}: {
  image: { name: string; src: string };
  imageKey: number;
  counter: { position: number; count: number } | null;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="pointer-events-auto flex items-center gap-3 pl-5 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="min-w-0 flex-1 truncate text-[14px] text-white/85">{image.name}</p>
        <button type="button" data-autofocus aria-label="Close preview" title="Close · Esc" onClick={onClose} className={darkControl}>
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        <motion.img
          key={imageKey}
          src={image.src}
          alt={image.name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-auto max-h-full max-w-full rounded-xl object-contain"
        />
      </div>
      <div className="flex h-16 shrink-0 items-start justify-center pb-[env(safe-area-inset-bottom)]">
        {counter && (
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/10 px-1">
            <button type="button" aria-label="Previous image" onClick={onPrev} disabled={!onPrev} className={darkControl}>
              <ChevronLeft className="size-5" />
            </button>
            <p aria-live="polite" className="min-w-14 text-center font-mono text-[13px] tabular-nums text-white">
              <span className="sr-only">Image </span>
              {counter.position + 1}
              <span aria-hidden="true"> / </span>
              <span className="sr-only"> of </span>
              {counter.count}
            </p>
            <button type="button" aria-label="Next image" onClick={onNext} disabled={!onNext} className={darkControl}>
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function FileView({ file, onClose }: { file: { name: string; content: string; meta?: string }; onClose: () => void }) {
  return (
    <div className="flex max-h-[min(85dvh,48rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden rounded-[22px] border border-line bg-elevated text-fg shadow-soft">
      <div className="flex items-center gap-3 border-b border-line py-2 pl-5 pr-2">
        <FileText className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{file.name}</p>
          {file.meta && <p className="font-mono text-[11px] text-muted">{file.meta}</p>}
        </div>
        <button
          type="button"
          data-autofocus
          aria-label="Close preview"
          title="Close · Esc"
          onClick={onClose}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-fg"
        >
          <X className="size-5" />
        </button>
      </div>
      {file.content ? (
        <pre
          tabIndex={0}
          aria-label={`Contents of ${file.name}`}
          className={cx(
            "min-h-0 flex-1 overflow-auto p-5 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg",
            PROSE_FILE.test(file.name) && "whitespace-pre-wrap break-words",
          )}
        >
          {file.content}
        </pre>
      ) : (
        <p className="p-5 text-[14px] text-muted">This file is empty.</p>
      )}
    </div>
  );
}
