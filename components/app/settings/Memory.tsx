"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Stepper, Switch } from "@/components/kit/Controls";
import { ChevronDown, Ellipsis, FileText, Folder, Lock, Pencil, Plus, Trash } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Spinner } from "@/components/kit/Spinner";
import { cx } from "@/lib/cx";
import { Group, Row, SectionIntro } from "./Layout";

export type MemoryPrefs = { enabled: boolean; interval: number; auto: boolean; liveWrites: boolean };
/** `undecryptable`: saved in a form this device can't open (usually an older format); the text fields are empty. */
export type MemoryFileItem = { id: string; name: string; description: string; content: string; undecryptable?: boolean };
export type MemoryCategoryItem = { id: string; name: string; files: MemoryFileItem[]; undecryptable?: boolean };

export type MemoryActions = {
  createCategory: (name: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  createFile: (categoryId: string, name: string, description: string) => void;
  updateFile: (id: string, patch: Omit<MemoryFileItem, "id">) => void;
  deleteFile: (id: string) => void;
};

export type MemorySettingsProps = {
  prefs: MemoryPrefs;
  onPrefs: (patch: Partial<MemoryPrefs>) => void;
  pending?: number;
  refreshing?: { batch: number; total: number } | null;
  onRefresh: () => void;
  /** Opens Customize → Your memory, where the categories and files live. */
  onOpenFiles: () => void;
};

export type MemoryFilesProps = {
  categories: MemoryCategoryItem[] | null;
  actions: MemoryActions;
  /** Memory is switched off: the files stay readable and editable, but chats don't use them. */
  off: boolean;
  onTurnOn: () => void;
};

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;
const input =
  "h-10 w-full rounded-xl border border-line-strong bg-bg px-3 text-[14px] outline-none transition-[border-color] duration-150 placeholder:text-subtle focus:border-fg/40";

function InlineAdd({ placeholder, onAdd, label }: { placeholder: string; onAdd: (v: string) => void; label: string }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const close = () => {
    setOpen(false);
    setValue("");
  };
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full cursor-pointer items-center gap-2.5 px-4 text-left text-[13.5px] text-muted transition-colors duration-150 hover:text-fg"
      >
        <Plus className="size-3.5" />
        {label}
      </button>
    );
  return (
    <form
      className="flex items-center gap-2 px-4 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value.trim());
        setValue("");
        setOpen(false);
      }}
    >
      <input
        autoFocus
        data-focus="within"
        aria-label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        onBlur={() => !value.trim() && close()}
        placeholder={placeholder}
        className={input}
      />
      <Button variant="ghost" onClick={close}>
        Cancel
      </Button>
      <Button type="submit" disabled={!value.trim()}>
        Add
      </Button>
    </form>
  );
}

function FileEditor({
  file,
  onSave,
  onDelete,
  onClose,
}: {
  file: MemoryFileItem;
  onSave: (patch: Omit<MemoryFileItem, "id">) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState({ name: file.name, description: file.description, content: file.content });
  const dirty = draft.name !== file.name || draft.description !== file.description || draft.content !== file.content;
  return (
    <div className="flex flex-col gap-2.5 bg-surface px-4 py-4">
      <input
        data-focus="within"
        aria-label="File name"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        className={cx(input, "font-medium")}
      />
      <input
        data-focus="within"
        aria-label="What this file is for"
        value={draft.description}
        placeholder="What this file is for"
        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        className={input}
      />
      <textarea
        data-focus="within"
        aria-label="Content"
        rows={6}
        value={draft.content}
        placeholder="What Karui should remember"
        onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
        className="w-full resize-y rounded-xl border border-line-strong bg-bg px-3 py-2.5 font-mono text-[12.5px] leading-relaxed outline-none transition-[border-color] duration-150 placeholder:font-sans placeholder:text-subtle focus:border-fg/40"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
        >
          <Trash className="size-3.5" />
          Delete file
        </button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {dirty ? "Cancel" : "Close"}
          </Button>
          <Button
            disabled={!dirty || !draft.name.trim()}
            onClick={() => {
              onSave({ ...draft, name: draft.name.trim() });
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Undecryptable() {
  return (
    <span className="flex min-w-0 items-center gap-1.5 italic text-muted">
      <Lock className="size-3.5 shrink-0" />
      <span className="truncate">Can&apos;t be decrypted on this device</span>
    </span>
  );
}

/** The ⋯ button at the end of a category or file row; on devices with hover it shows while the row is hovered or focused. */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <Menu label={label} items={items}>
      {({ open, triggerProps }) => (
        <button
          {...triggerProps}
          aria-label={label}
          className={cx(
            "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[opacity,background-color] duration-150 hover:bg-surface-2 hover:text-fg",
            open
              ? "bg-surface-2 text-fg"
              : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100",
          )}
        >
          <Ellipsis />
        </button>
      )}
    </Menu>
  );
}

function Category({ category, actions }: { category: MemoryCategoryItem; actions: MemoryActions }) {
  const [open, setOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [editing, setEditing] = React.useState<string | null>(null);

  const commitName = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== category.name) actions.renameCategory(category.id, name.trim());
    else setName(category.name);
  };

  return (
    <div>
      <div className="group/row flex items-center gap-1 pr-2">
        {renaming ? (
          <div className="flex-1 px-3 py-2">
            <input
              autoFocus
              data-focus="within"
              aria-label="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setName(category.name);
                  setRenaming(false);
                }
              }}
              className={input}
            />
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 px-4 text-left"
          >
            <ChevronDown className={cx("size-3.5 text-muted transition-transform duration-300 ease-out-soft", !open && "-rotate-90")} />
            {!category.undecryptable && <Folder className="size-4 text-muted" />}
            <span className="flex min-w-0 flex-1 text-[14.5px] font-medium tracking-[-0.01em]">
              {category.undecryptable ? <Undecryptable /> : <span className="truncate">{category.name}</span>}
            </span>
            <span className="font-mono text-[11px] text-muted tabular-nums">{category.files.length}</span>
          </button>
        )}
        <RowMenu
          label={category.undecryptable ? "Actions for this category" : `Actions for ${category.name}`}
          items={[
            { label: "Rename", icon: <Pencil className="size-3.5" />, onSelect: () => setRenaming(true) },
            { type: "separator" },
            { label: "Delete category", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => actions.deleteCategory(category.id) },
          ]}
        />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <ul className="border-t border-line">
              {category.files.map((f) =>
                editing === f.id ? (
                  <li key={f.id} className="border-b border-line">
                    <FileEditor
                      file={f}
                      onSave={(patch) => actions.updateFile(f.id, patch)}
                      onDelete={() => {
                        actions.deleteFile(f.id);
                        setEditing(null);
                      }}
                      onClose={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <li key={f.id} className="group/row flex items-center border-b border-line pr-2 transition-colors duration-150 hover:bg-surface">
                    {f.undecryptable ? (
                      <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-11 pr-2 text-[14px]">
                        <Undecryptable />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(f.id)}
                        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-3 pl-11 pr-2 text-left"
                      >
                        <FileText className="mt-0.5 size-3.5 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] tracking-[-0.01em]">{f.name}</span>
                          {f.description && <span className="block truncate text-[12.5px] text-muted">{f.description}</span>}
                        </span>
                      </button>
                    )}
                    <RowMenu
                      label={f.undecryptable ? "Actions for this file" : `Actions for ${f.name}`}
                      items={[
                        ...(f.undecryptable
                          ? []
                          : [{ label: "Edit", icon: <Pencil className="size-3.5" />, onSelect: () => setEditing(f.id) }, { type: "separator" as const }]),
                        { label: "Delete file", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => actions.deleteFile(f.id) },
                      ]}
                    />
                  </li>
                ),
              )}
            </ul>
            <div className="pl-7">
              <InlineAdd label="Add file" placeholder="File name, e.g. Diet" onAdd={(n) => actions.createFile(category.id, n, "")} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MemorySettings({ prefs, onPrefs, pending, refreshing, onRefresh, onOpenFiles }: MemorySettingsProps) {
  const off = !prefs.enabled;
  return (
    <>
      <Group>
        <Row
          label="Use memory"
          description="Chats can read from memory and suggest what to add."
          control={<Switch checked={prefs.enabled} onChange={(v) => onPrefs({ enabled: v })} label="Use memory" />}
        />
        <Row
          label="Your memory"
          description="Read and edit it under Customize."
          control={
            <Button variant="secondary" onClick={onOpenFiles}>
              Open
            </Button>
          }
        />
      </Group>

      <div className={cx("mt-9 transition-opacity duration-300", off && "pointer-events-none opacity-40")} aria-disabled={off}>
        <Group title="Organising">
          <Row
            label="Save when I ask"
            description="Say “remember that…” in a chat and it's written straight away."
            control={<Switch checked={prefs.liveWrites} onChange={(v) => onPrefs({ liveWrites: v })} label="Save when I ask" disabled={off} />}
          />
          <Row
            label="Organise automatically"
            description={`Tidies memory in the background after every ${prefs.interval} messages.`}
            control={<Switch checked={prefs.auto} onChange={(v) => onPrefs({ auto: v })} label="Organise automatically" disabled={off} />}
          />
          <Row
            label="Messages between passes"
            control={<Stepper label="messages between passes" value={prefs.interval} min={1} max={100} onChange={(v) => onPrefs({ interval: v })} />}
          />
          <Row
            label="Organise now"
            description={
              refreshing
                ? refreshing.total
                  ? `Working through batch ${refreshing.batch} of ${refreshing.total}…`
                  : "Checking for new messages…"
                : pending
                  ? `${pending} new ${pending === 1 ? "message" : "messages"} to look at.`
                  : "Everything is up to date."
            }
            control={
              <Button variant="secondary" onClick={onRefresh} disabled={!!refreshing || off} aria-busy={!!refreshing || undefined}>
                {refreshing ? <Spinner className="size-3.5" /> : null}
                {refreshing ? "Organising" : "Organise"}
              </Button>
            }
          />
        </Group>
      </div>

      <SectionIntro>
        Memory lets Karui carry what matters from one chat to the next, sorted into categories and files.
      </SectionIntro>
    </>
  );
}

/** Customize → Your memory: the categories and files ordinary chats read from. */
export function MemoryFiles({ categories, actions, off, onTurnOn }: MemoryFilesProps) {
  return (
    <>
      {off && (
        <div className="mb-9">
          <Group>
            <Row
              label="Memory is off"
              description="Chats don't read these files or add to them until you turn it on."
              control={
                <Button variant="secondary" onClick={onTurnOn}>
                  Turn on
                </Button>
              }
            />
          </Group>
        </div>
      )}

      <Group>
        {categories === null ? (
          <div className="flex flex-col gap-3 px-4 py-4" aria-label="Loading memory">
            {[40, 55, 35].map((w, i) => (
              <span key={i} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <>
            {categories.length === 0 && (
              <p className="px-4 py-5 text-[13.5px] leading-relaxed text-muted">
                Nothing here yet. Memory fills in as you chat, or add a category yourself.
              </p>
            )}
            {categories.map((c) => (
              <Category key={c.id} category={c} actions={actions} />
            ))}
            <InlineAdd label="Add category" placeholder="Category name, e.g. Health" onAdd={actions.createCategory} />
          </>
        )}
      </Group>

      <SectionIntro>
        What Karui remembers, sorted into categories and files. Change or delete anything; your next message uses the new version. Chats in a project keep their own memory.
      </SectionIntro>
    </>
  );
}
