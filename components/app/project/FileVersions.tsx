"use client";

import * as React from "react";
import { Bookmark, ChevronDown } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Spinner } from "@/components/kit/Spinner";
import { useNow } from "@/components/kit/useMounted";
import { toDocument, type ArtifactType } from "@/lib/artifacts";
import { cx } from "@/lib/cx";
import { exactStamp } from "../ChatsView";
import { DocumentPaper } from "../chat/ArtifactPanel";

export type FileVersionItem = {
  id: string;
  number: number;
  savedAt: string;
  size: number;
  kept: boolean;
  /** In place of the time, e.g. "from Karui". */
  hint?: string;
};

/** Every save is the next number; the last three earlier versions rotate, kept ones stay. */
export type FileVersionsProps = {
  /** Earlier versions, newest first; null while loading. */
  list: FileVersionItem[] | null;
  error: boolean;
  /** An earlier version shown instead of the file, read only; `content` is null while it's fetched and decrypted. */
  viewing: { version: FileVersionItem; content: string | null; error: boolean } | null;
  restoring: boolean;
  /** Called when the picker opens. */
  onLoad: () => void;
  /** null goes back to the current version. */
  onView: (v: FileVersionItem | null) => void;
  onRestore: (v: FileVersionItem) => void;
  onDelete: (v: FileVersionItem) => void;
  /** Keeps the current version in the history once it's replaced. */
  onKeep: () => void;
};

export type CurrentVersion = { number: number; kept: boolean };

const smallButton =
  "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-[opacity,background-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

const note = (text: React.ReactNode) => <p className="flex items-center gap-2 text-[12.5px] leading-relaxed text-muted">{text}</p>;

/** Shared by the picker and, in a narrow panel, the file's ⋯ menu. */
export function versionMenuItems(current: CurrentVersion, canKeep: boolean, p: FileVersionsProps, now: Date | null): MenuItem[] {
  const shown = p.viewing?.version.number ?? current.number;
  const items: MenuItem[] = [
    { type: "header", content: <p className="text-label text-muted">Versions</p> },
    { label: `v${current.number}`, hint: current.kept ? "now · kept" : "now", checked: shown === current.number, onSelect: () => p.onView(null) },
  ];
  if (p.error) {
    items.push({ type: "header", content: note("Earlier versions couldn't be loaded.") }, { label: "Try again", onSelect: p.onLoad });
  } else if (p.list === null) {
    items.push({ type: "header", content: note(<><Spinner className="size-3" />Loading earlier versions…</>) });
  } else if (p.list.length === 0) {
    items.push({ type: "header", content: note("Each save makes a new version. The last three stay here.") });
  } else {
    for (const v of p.list) {
      const hint = v.hint ?? [now && exactStamp(v.savedAt, now), v.kept && "kept"].filter(Boolean).join(" · ");
      items.push({ label: `v${v.number}`, hint, checked: shown === v.number, onSelect: () => p.onView(v) });
    }
  }
  // Keeping waits until changes are saved or dropped: what's kept is what's saved.
  if (canKeep && !current.kept) {
    items.push({ type: "separator" }, { label: `Keep v${current.number}`, icon: <Bookmark className="size-3.5" />, onSelect: p.onKeep });
  }
  return items;
}

export function VersionPicker({ current, canKeep, p }: { current: CurrentVersion; canKeep: boolean; p: FileVersionsProps }) {
  const now = useNow();
  const shown = p.viewing?.version.number ?? current.number;
  return (
    <Menu
      label="Versions"
      panelClassName="min-w-[240px]"
      items={versionMenuItems(current, canKeep, p, now)}
      onOpenChange={(open) => open && p.onLoad()}
    >
      {({ open, triggerProps }) => (
        <button
          {...triggerProps}
          aria-label={`Version ${shown}. Show another version`}
          className={cx(
            "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 font-mono text-[12px] tracking-[-0.01em] transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
            open ? "bg-surface-2 text-fg" : "text-fg hover:bg-surface-2",
          )}
        >
          v{shown}
          <ChevronDown className={cx("size-3.5 text-muted transition-transform duration-300 ease-out-soft", open && "rotate-180")} />
        </button>
      )}
    </Menu>
  );
}

export function VersionPaper({
  name,
  type,
  viewing,
  onRetry,
  frameRef,
}: {
  name: string;
  type: ArtifactType;
  viewing: NonNullable<FileVersionsProps["viewing"]>;
  onRetry: () => void;
  frameRef?: React.Ref<HTMLIFrameElement>;
}) {
  const { version, content } = viewing;
  const document = React.useMemo(() => (content === null ? "" : toDocument({ title: name, type, content })), [content, name, type]);

  if (viewing.error) {
    return (
      <div className="px-4 pt-4" role="alert">
        <p className="text-[13px] leading-relaxed text-muted">v{version.number} couldn&apos;t be opened or decrypted.</p>
        <button type="button" onClick={onRetry} className={cx(smallButton, "mt-3 text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2/70")}>
          Try again
        </button>
      </div>
    );
  }
  if (content === null) {
    return (
      <div className="flex flex-col gap-2.5 px-4 pt-4" aria-label={`Opening v${version.number}`}>
        {[92, 78, 85, 60, 88].map((w, i) => (
          <span key={i} className="h-2.5 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 p-3">
      <DocumentPaper title={`${name}, v${version.number}`} document={document} frameRef={frameRef} />
    </div>
  );
}
