"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { ChevronDown, FilePlus, FileText, Folder, FolderPlus, X } from "@/components/kit/icons";
import { Spinner } from "@/components/kit/Spinner";
import { cx } from "@/lib/ui/cx";
import type { MemoryFileItem } from "../settings/Memory";

/** `version` counts saves (v1, v2, …); `kept` keeps the current one in the history once it's replaced. */
export type LibraryFile = { id: string; path: string; size: number; version?: number; kept?: boolean };
export type LibraryMemoryFile = MemoryFileItem & { fromYou?: boolean };
export type LibraryUsage = { used: number; limit: number; files: number; maxFiles: number };

export type PickedItem =
  | { kind: "file"; id: string; name: string; size: number }
  | { kind: "folder"; id: string; name: string; files: { path: string; size: number }[] };
export type SkipReason = "folder" | "binary" | "secret" | "too-big" | "lockfile" | "unreadable";
export type SkippedItem = { path: string; reason: SkipReason };
export type ContextSelection = { items: PickedItem[]; skipped: SkippedItem[]; reading?: number };

export const ACCEPT_TEXT_AND_PDF = "text/*,.pdf,.md,.txt,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.c,.h,.cpp,.cs,.rb,.php,.swift,.kt,.sql,.yaml,.yml,.toml,.html,.css,.sh,.tex,.bib";

const SKIP_LABEL: Record<SkipReason, string> = {
  folder: "ignored folder",
  binary: "not text or PDF",
  secret: "may hold secrets",
  "too-big": "over 2 MB",
  lockfile: "lockfile",
  unreadable: "couldn't be read",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function selectionSize(items: PickedItem[]): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  for (const it of items) {
    if (it.kind === "file") {
      bytes += it.size;
      files += 1;
    } else {
      for (const f of it.files) bytes += f.size;
      files += it.files.length;
    }
  }
  return { bytes, files };
}

export function UsageMeter({
  usage,
  adding = { bytes: 0, files: 0 },
  className,
}: {
  usage: LibraryUsage;
  adding?: { bytes: number; files: number };
  className?: string;
}) {
  const used = usage.used + adding.bytes;
  const files = usage.files + adding.files;
  const over = used > usage.limit || files > usage.maxFiles;
  const share = Math.min(1, Math.max(used / usage.limit, files / usage.maxFiles));
  return (
    <div className={className}>
      <div
        role="meter"
        aria-label="Library space"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={Math.min(used, usage.limit)}
        className="h-1 overflow-hidden rounded-full bg-surface-2"
      >
        <motion.div
          initial={false}
          animate={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }}
          transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          className={cx("h-full rounded-full", over ? "bg-danger" : share >= 0.8 ? "bg-fg" : "bg-fg/35")}
        />
      </div>
      <p className={cx("mt-2 font-mono text-[11px] tabular-nums", over ? "text-danger" : "text-muted")}>
        {formatBytes(used)} of {formatBytes(usage.limit)} · {files} of {usage.maxFiles} files
      </p>
    </div>
  );
}

function useHiddenInputs(onAddFiles: (f: File[]) => void, onAddFolder: (f: File[]) => void) {
  const filesRef = React.useRef<HTMLInputElement>(null);
  const folderRef = React.useRef<HTMLInputElement>(null);

  // `webkitdirectory` isn't in React's input props; it turns the picker into a folder picker.
  React.useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const take = (e: React.ChangeEvent<HTMLInputElement>, fn: (f: File[]) => void) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length) fn(list);
  };

  const inputs = (
    <>
      <input ref={filesRef} type="file" multiple accept={ACCEPT_TEXT_AND_PDF} hidden onChange={(e) => take(e, onAddFiles)} />
      <input ref={folderRef} type="file" multiple hidden onChange={(e) => take(e, onAddFolder)} />
    </>
  );
  return { inputs, pickFiles: () => filesRef.current?.click(), pickFolder: () => folderRef.current?.click() };
}

export function AddButtons({
  onAddFiles,
  onAddFolder,
  disabled,
  size = "md",
}: {
  onAddFiles: (f: File[]) => void;
  onAddFolder: (f: File[]) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const { inputs, pickFiles, pickFolder } = useHiddenInputs(onAddFiles, onAddFolder);
  const cls = cx(
    "flex cursor-pointer items-center gap-2 rounded-full text-fg ring-1 ring-inset ring-line-strong transition-[background-color,transform] duration-150 hover:bg-surface active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
    size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]",
  );
  return (
    <>
      {inputs}
      <button type="button" onClick={pickFiles} disabled={disabled} className={cls}>
        <FilePlus className="size-3.5 text-muted" />
        Add files
      </button>
      <button type="button" onClick={pickFolder} disabled={disabled} className={cls}>
        <FolderPlus className="size-3.5 text-muted" />
        Add folder
      </button>
    </>
  );
}

function PickedRow({ item, onRemove, disabled }: { item: PickedItem; onRemove: () => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const size = item.kind === "file" ? item.size : item.files.reduce((n, f) => n + f.size, 0);
  return (
    <li>
      <div className="flex min-h-11 items-center gap-2.5 pl-3 pr-1.5">
        {item.kind === "folder" ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
          >
            <ChevronDown className={cx("size-3.5 shrink-0 text-muted transition-transform duration-300 ease-out-soft", !open && "-rotate-90")} />
            <Folder className="size-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-[14px] tracking-[-0.01em]">{item.name}/</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
              {item.files.length} {item.files.length === 1 ? "file" : "files"} · {formatBytes(size)}
            </span>
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-6">
            <FileText className="size-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-[14px] tracking-[-0.01em]">{item.name}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{formatBytes(size)}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${item.name}`}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-45"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && item.kind === "folder" && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="max-h-40 overflow-y-auto pb-2 pl-[3.25rem] pr-4"
          >
            {item.files.map((f) => (
              <li key={f.path} className="flex items-baseline gap-3 py-0.5 font-mono text-[11.5px] text-muted">
                <span className="min-w-0 flex-1 truncate" title={f.path}>
                  {f.path}
                </span>
                <span className="shrink-0 tabular-nums">{formatBytes(f.size)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function Skipped({ skipped }: { skipped: SkippedItem[] }) {
  const [open, setOpen] = React.useState(false);
  if (!skipped.length) return null;
  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-muted transition-colors duration-150 hover:text-fg"
      >
        {skipped.length} skipped
        <ChevronDown className={cx("size-3 transition-transform duration-300 ease-out-soft", !open && "-rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="max-h-32 overflow-y-auto pt-1.5"
          >
            {skipped.map((s) => (
              <li key={s.path} className="flex items-baseline gap-2 py-0.5 font-mono text-[11px] text-muted">
                <span className="min-w-0 truncate text-fg/80" title={s.path}>
                  {s.path}
                </span>
                <span className="shrink-0">· {SKIP_LABEL[s.reason]}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ContextPicker({
  selection,
  usage,
  plan,
  onAddFiles,
  onAddFolder,
  onDropData,
  onRemove,
  onUpgrade,
  disabled,
}: {
  selection: ContextSelection;
  usage: LibraryUsage;
  plan: "Free" | "Pro";
  onAddFiles: (files: File[]) => void;
  onAddFolder: (files: File[]) => void;
  onDropData?: (data: DataTransfer) => void;
  onRemove: (id: string) => void;
  onUpgrade?: () => void;
  disabled?: boolean;
}) {
  const [over, setOver] = React.useState(false);
  const adding = selectionSize(selection.items);
  const tooMuch = usage.used + adding.bytes > usage.limit || usage.files + adding.files > usage.maxFiles;
  const empty = selection.items.length === 0 && !selection.reading;

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (!onDropData || disabled) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(e) => {
          if (!onDropData || disabled) return;
          e.preventDefault();
          setOver(false);
          onDropData(e.dataTransfer);
        }}
        className={cx(
          "overflow-hidden rounded-[16px] border bg-bg transition-[border-color,box-shadow] duration-150",
          over ? "border-fg shadow-[0_0_0_3px_var(--line)]" : "border-line-strong",
        )}
      >
        {empty ? (
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <p className="max-w-[22rem] text-pretty text-[13.5px] leading-relaxed text-muted">
              Notes, papers or a code folder. Each chat reads the files it needs.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <AddButtons onAddFiles={onAddFiles} onAddFolder={onAddFolder} disabled={disabled} />
            </div>
            <p className="mt-3 font-mono text-[11px] text-muted">Text, code and PDF · or drop them here</p>
          </div>
        ) : (
          <>
            <ul className="max-h-[min(15rem,35vh)] divide-y divide-line overflow-y-auto">
              {!!selection.reading && (
                <li className="flex min-h-11 items-center gap-2.5 px-3 text-[13.5px] text-muted">
                  <Spinner className="size-3.5" />
                  Reading {selection.reading === 1 ? "1 PDF" : `${selection.reading} PDFs`}…
                </li>
              )}
              {selection.items.map((it) => (
                <PickedRow key={it.id} item={it} onRemove={() => onRemove(it.id)} disabled={disabled} />
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 border-t border-line px-3 py-2.5">
              <AddButtons onAddFiles={onAddFiles} onAddFolder={onAddFolder} disabled={disabled} size="sm" />
            </div>
          </>
        )}
      </div>

      <Skipped skipped={selection.skipped} />

      {!empty && <UsageMeter usage={usage} adding={adding} className="mt-3" />}
      {tooMuch ? (
        <p className="mt-1.5 text-pretty text-[12.5px] leading-relaxed text-danger">
          {plan} holds {formatBytes(usage.limit)} and {usage.maxFiles} files per project. Remove something
          {onUpgrade ? (
            <>
              , or{" "}
              <button type="button" onClick={onUpgrade} className="cursor-pointer font-medium underline underline-offset-2">
                see Pro
              </button>
            </>
          ) : null}
          .
        </p>
      ) : (
        empty && (
          <p className="mt-2 font-mono text-[11px] text-muted">
            {formatBytes(usage.limit)} and {usage.maxFiles} files per project on {plan}
          </p>
        )
      )}
    </div>
  );
}

export function AddToLibraryDialog({
  open,
  onClose,
  onAdd,
  progress,
  ...picker
}: React.ComponentProps<typeof ContextPicker> & {
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
  progress?: { done: number; total: number } | null;
}) {
  const adding = selectionSize(picker.selection.items);
  const tooMuch = picker.usage.used + adding.bytes > picker.usage.limit || picker.usage.files + adding.files > picker.usage.maxFiles;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-w-[32rem]"
      title="Add to Library"
      description="Every chat in this project can read these files. They're encrypted in your browser before they leave it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={!!progress}>
            Cancel
          </Button>
          <Button loading={!!progress} disabled={!adding.files || tooMuch || !!picker.selection.reading} onClick={onAdd}>
            {progress ? `Adding ${progress.done} of ${progress.total}` : adding.files > 1 ? `Add ${adding.files} files` : "Add file"}
          </Button>
        </>
      }
    >
      <ContextPicker {...picker} disabled={!!progress} />
    </Dialog>
  );
}
