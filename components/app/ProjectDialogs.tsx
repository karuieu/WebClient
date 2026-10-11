"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Field } from "@/components/kit/Field";
import { cx } from "@/lib/cx";
import { SearchField, SelectDot } from "./ChatsView";
import { ContextPicker, selectionSize } from "./project/Library";

export type ProjectDraft = { name: string; goal: string };

export function ProjectFormDialog({
  open,
  saving,
  progress,
  error,
  onClose,
  onSubmit,
  context,
}: {
  open: boolean;
  saving?: boolean;

  progress?: { done: number; total: number } | null;
  error?: string | null;
  onClose: () => void;
  onSubmit: (draft: ProjectDraft) => void;
  context: Omit<React.ComponentProps<typeof ContextPicker>, "disabled">;
}) {
  const [draft, setDraft] = React.useState<ProjectDraft>({ name: "", goal: "" });

  React.useEffect(() => {
    if (open) setDraft({ name: "", goal: "" });
  }, [open]);

  const busy = saving || !!progress;
  const adding = selectionSize(context.selection.items);
  const tooMuch = adding.bytes > context.usage.limit || adding.files > context.usage.maxFiles;
  const ready = !!draft.name.trim() && !tooMuch && !context.selection.reading && !busy;
  const submit = () => ready && onSubmit({ name: draft.name.trim(), goal: draft.goal.trim() });

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      className="max-w-[34rem]"
      title="New project"
      description="A place for one goal: its chats, the files they read and what they remember. All of it is encrypted in your browser."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!ready && !busy} onClick={submit}>
            {progress ? `Adding files · ${progress.done} of ${progress.total}` : "Create project"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          id="project-name"
          label="Name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Thesis"
          data-autofocus
          error={error}
          disabled={busy}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="project-goal" className="text-sm font-medium tracking-[-0.01em]">
              Goal
            </label>
            <span className="font-mono text-[11px] text-muted">Optional</span>
          </div>
          <textarea
            id="project-goal"
            data-focus="within"
            rows={2}
            value={draft.goal}
            disabled={busy}
            onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
            placeholder="What should this project get done?"
            className="min-h-[4.5rem] w-full resize-y rounded-[16px] border border-line-strong bg-bg px-4 py-3 text-[15px] leading-relaxed tracking-[-0.01em] text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus:border-fg focus:shadow-[0_0_0_3px_var(--line)]"
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium tracking-[-0.01em]">Context</span>
            <span className="font-mono text-[11px] text-muted">Optional</span>
          </div>
          <ContextPicker {...context} disabled={busy} />
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export type AssignableChat = { id: string; title: string; meta?: string };

export function AddChatsDialog({
  open,
  onClose,
  onAdd,
  adding,
  projectName,
  chats,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
  adding?: boolean;
  projectName: string;
  chats: AssignableChat[];
}) {
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(new Set());
    }
  }, [open]);

  const shown = chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-w-[30rem]"
      title={`Add chats to ${projectName}`}
      description="From their next message they can read this project's Library and memory."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={adding} disabled={!picked.size} onClick={() => onAdd([...picked])}>
            {picked.size > 1 ? `Add ${picked.size} chats` : "Add chat"}
          </Button>
        </>
      }
    >
      <SearchField value={query} onChange={setQuery} placeholder="Search chats" label="Search chats" />
      <div className="-mx-1.5 mt-3 flex max-h-[min(18rem,45vh)] flex-col gap-0.5 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13.5px] text-muted">
            {chats.length ? "Nothing matches." : "No other chats to add."}
          </p>
        ) : (
          shown.map((c) => {
            const on = picked.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c.id)}
                className={cx(
                  "flex min-h-12 shrink-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150",
                  on ? "bg-surface" : "hover:bg-surface",
                )}
              >
                <SelectDot checked={on} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] tracking-[-0.01em]">{c.title}</span>
                  {c.meta && <span className="block font-mono text-[11px] text-muted">{c.meta}</span>}
                </span>
              </button>
            );
          })
        )}
      </div>
    </Dialog>
  );
}

export function ProjectLimitDialog({ open, onClose, onUpgrade }: { open: boolean; onClose: () => void; onUpgrade: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="One project on Free"
      description="Your Free plan includes one project. Pro gives you room for more, along with more models."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button onClick={onUpgrade} arrow data-autofocus>
            See Pro
          </Button>
        </>
      }
    />
  );
}
