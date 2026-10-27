"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Check, Folder, FolderMinus, Plus } from "@/components/kit/icons";
import { cx } from "@/lib/ui/cx";

export function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  deleting,
  kind,
  name,
  count = 1,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
  kind: "chat" | "project" | "file" | "version";
  name: string;
  count?: number;
  preview?: string | null;
}) {
  const many = kind === "chat" && count > 1;
  const title = many
    ? `Delete ${count} chats?`
    : kind === "chat"
      ? "Delete this chat?"
      : kind === "project"
        ? "Delete this project?"
        : kind === "version"
          ? "Delete this version?"
          : count > 1
          ? "Delete this folder?"
          : "Delete this file?";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={
        many ? (
          <>These chats and all of their messages will be deleted for good.</>
        ) : kind === "chat" ? (
          <>
            <span className="font-medium text-fg">{name}</span> and all of its messages will be deleted for good.
          </>
        ) : kind === "project" ? (
          <>
            <span className="font-medium text-fg">{name}</span>, its Library and memory will be deleted for good. Its chats stay in your library.
          </>
        ) : kind === "version" ? (
          <>
            <span className="font-medium text-fg">{name}</span> will be deleted for good. The file itself stays as it is.
          </>
        ) : (
          <>
            <span className="font-medium text-fg">{name}</span>
            {count > 1 ? ` and the ${count} files in it will leave the Library.` : " will leave the Library."} Chats stop reading {count > 1 ? "them" : "it"} from their next message.
          </>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      {preview && !many ? (
        <p className="line-clamp-3 rounded-xl border-l-2 border-line-strong bg-surface py-2.5 pl-3.5 pr-3 text-[13.5px] leading-relaxed text-muted">
          {preview}
        </p>
      ) : null}
    </Dialog>
  );
}

export type PickerProject = { id: string; name: string; chats?: number };

export function ProjectPickerDialog({
  open,
  onClose,
  onMove,
  onCreateProject,
  moving,
  chatTitle,
  projects,
  currentProjectId,
}: {
  open: boolean;
  onClose: () => void;
  onMove: (projectId: string | null) => void;
  onCreateProject?: () => void;
  moving?: boolean;
  chatTitle?: string;
  projects: PickerProject[];
  currentProjectId?: string | null;
}) {
  const [selected, setSelected] = React.useState<string | null>(currentProjectId ?? null);

  React.useEffect(() => {
    if (open) setSelected(currentProjectId ?? null);
  }, [open, currentProjectId]);

  const options: { id: string | null; name: string; meta?: string; icon: React.ReactNode }[] = [
    ...projects.map((p) => ({
      id: p.id,
      name: p.name,
      meta: p.chats !== undefined ? `${p.chats} ${p.chats === 1 ? "chat" : "chats"}` : undefined,
      icon: <Folder className="size-4" />,
    })),
    ...(currentProjectId ? [{ id: null, name: "No project", icon: <FolderMinus className="size-4" /> }] : []),
  ];

  const unchanged = selected === (currentProjectId ?? null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={chatTitle ? "Move to project" : "Add to project"}
      description={
        chatTitle ? (
          <>
            Pick a home for <span className="font-medium text-fg">{chatTitle}</span>. It picks up the project&apos;s instructions and memory.
          </>
        ) : (
          "Your new chat starts in this project, with its instructions and memory."
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={moving} disabled={unchanged} onClick={() => onMove(selected)}>
            {chatTitle ? "Move" : "Add"}
          </Button>
        </>
      }
    >
      {projects.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-5 text-center text-[13.5px] text-muted">You don&apos;t have any projects yet.</p>
      ) : (
        <div role="radiogroup" aria-label="Projects" className="-mx-1.5 flex max-h-[min(20rem,50vh)] flex-col gap-0.5 overflow-y-auto">
          {options.map((o) => {
            const active = selected === o.id;
            return (
              <button
                key={o.id ?? "none"}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(o.id)}
                className={cx(
                  "relative flex h-11 shrink-0 cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[14px] tracking-[-0.01em] transition-colors duration-150",
                  active ? "text-fg" : "text-muted hover:bg-surface hover:text-fg",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="project-picker-active"
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                    className="absolute inset-0 rounded-xl bg-surface ring-1 ring-line"
                  />
                )}
                <span className="relative">{o.icon}</span>
                <span className="relative min-w-0 flex-1 truncate">{o.name}</span>
                {o.meta && <span className="relative font-mono text-[11px] text-muted">{o.meta}</span>}
                <Check className={cx("relative size-4 transition-opacity duration-150", active ? "opacity-100" : "opacity-0")} />
              </button>
            );
          })}
        </div>
      )}
      {onCreateProject && (
        <button
          type="button"
          onClick={onCreateProject}
          className="mt-2 flex h-10 w-full cursor-pointer items-center gap-3 rounded-xl px-1.5 text-left text-[13.5px] text-muted transition-colors duration-150 hover:text-fg"
        >
          <Plus className="size-4" />
          New project
        </button>
      )}
    </Dialog>
  );
}
