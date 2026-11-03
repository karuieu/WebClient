"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Field } from "@/components/kit/Field";
import { Kbd } from "@/components/kit/Shortcut";
import { Stepper, Switch } from "@/components/kit/Controls";
import { ChevronDown, Ellipsis, Folder, Lock, MessageSquare, Pencil, Plus, Trash } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Spinner } from "@/components/kit/Spinner";
import { cx } from "@/lib/ui/cx";
import { PAGE_ACTION, PageActions } from "../PageActions";
import { Group, LIST_FRAME, Row, SectionIntro } from "./Layout";

export type MemoryPrefs = { enabled: boolean; interval: number; auto: boolean; liveWrites: boolean };
/** `undecryptable`: saved in a form this device can't open (usually an older format); the text fields are empty. */
export type MemoryFileItem = { id: string; name: string; description: string; content: string; undecryptable?: boolean };
export type MemoryCategoryItem = { id: string; name: string; files: MemoryFileItem[]; undecryptable?: boolean };

export type MemoryActions = {
  createCategory: (name: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  /** Returns the new file's id, so the dialog can move on to its memory. */
  createFile: (categoryId: string, name: string, description: string) => Promise<string | null>;
  updateFile: (id: string, patch: Omit<MemoryFileItem, "id">) => void;
  deleteFile: (id: string) => void;
};

export type MemorySettingsProps = {
  prefs: MemoryPrefs;
  onPrefs: (patch: Partial<MemoryPrefs>) => void;
  pending?: number;
  refreshing?: { batch: number; total: number } | null;
  onRefresh: () => void;
  /** Opens Workspace → Memory, where the categories and files live. */
  onOpenFiles: () => void;
};

export type MemoryFilesProps = {
  categories: MemoryCategoryItem[] | null;
  actions: MemoryActions;
  /** Memory is switched off: the files stay readable and editable, but chats don't use them. */
  off: boolean;
  onTurnOn: () => void;
  /** Starts a chat where Karui writes down what the user tells it. */
  onTalkWithKarui: () => void;
};

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

function CategoryDialog({
  open,
  title,
  initial = "",
  confirm,
  isTaken,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  initial?: string;
  confirm: string;
  isTaken: (name: string) => boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const formId = React.useId();
  const [name, setName] = React.useState(initial);
  React.useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const trimmed = name.trim();
  const taken = trimmed !== initial.trim() && isTaken(trimmed);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!trimmed || taken || trimmed === initial.trim()}>
            {confirm}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed || taken) return;
          onSave(trimmed);
          onClose();
        }}
      >
        <Field
          id={`${formId}-name`}
          label="Name"
          placeholder="Health"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={taken ? "You already have a category with this name." : undefined}
          data-autofocus
        />
      </form>
    </Dialog>
  );
}

const FIELD_LABEL = "block px-4 pt-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted";

/**
 * Creating asks only for a name and what the file is for; the same dialog then switches to the new
 * file so its memory can be written straight away. The parent decides when it closes.
 */
function FileDialog({
  open,
  category,
  file,
  justCreated = false,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  category: string;
  file?: MemoryFileItem;
  /** The file was created a moment ago in this dialog: focus goes to its memory. */
  justCreated?: boolean;
  onSave: (fields: Omit<MemoryFileItem, "id">) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const formId = React.useId();
  const contentRef = React.useRef<HTMLTextAreaElement>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [content, setContent] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setName(file?.name ?? "");
    setDescription(file?.description ?? "");
    setContent(file?.content ?? "");
  }, [open, file]);
  React.useEffect(() => {
    if (justCreated) contentRef.current?.focus();
  }, [justCreated, file]);
  const dirty = name !== (file?.name ?? "") || description !== (file?.description ?? "") || content !== (file?.content ?? "");
  const canSave = !!name.trim() && dirty;

  const submit = () => {
    if (canSave) onSave({ name: name.trim(), description: description.trim(), content });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={file ? "Edit file" : "New file"}
      description={
        <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[0.08em]">
          <Folder className="size-3.5" />
          {category}
        </span>
      }
      className="max-h-[92dvh] overflow-y-auto sm:max-w-[38rem]"
      footer={
        <>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mr-auto flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10 sm:h-10"
            >
              <Trash className="size-3.5" />
              Delete
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {justCreated && !dirty ? "Done" : "Cancel"}
          </Button>
          <Button type="submit" form={formId} disabled={!canSave}>
            {file ? "Save" : "Create"}
            <Kbd keys={["Mod", "↵"]} className="hidden opacity-60 [@media(hover:hover)]:inline" />
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        className="overflow-hidden rounded-2xl border border-line-strong bg-bg transition-[border-color,box-shadow] duration-150 focus-within:border-fg/40 focus-within:shadow-[0_0_0_3px_var(--line)]"
      >
        <label htmlFor={`${formId}-name`} className={FIELD_LABEL}>
          Name
        </label>
        <input
          id={`${formId}-name`}
          data-focus="within"
          data-autofocus
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Diet"
          className="h-11 w-full bg-transparent px-4 text-[17px] font-medium tracking-[-0.015em] outline-none placeholder:font-normal placeholder:text-subtle focus-visible:outline-none"
        />
        <label htmlFor={`${formId}-description`} className={FIELD_LABEL}>
          Description
        </label>
        <input
          id={`${formId}-description`}
          data-focus="within"
          autoComplete="off"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What I eat and avoid"
          className="h-11 w-full bg-transparent px-4 pb-1 text-[15px] outline-none placeholder:text-subtle focus-visible:outline-none"
        />
        {file && (
          <div className="border-t border-line">
            <label htmlFor={`${formId}-content`} className={FIELD_LABEL}>
              Memory
            </label>
            <textarea
              ref={contentRef}
              id={`${formId}-content`}
              data-focus="within"
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Vegetarian. No nuts. Coffee before noon only."
              className="block w-full resize-none bg-transparent px-4 pb-3.5 pt-2 text-[15px] leading-relaxed outline-none placeholder:text-subtle focus-visible:outline-none"
            />
          </div>
        )}
      </form>
    </Dialog>
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
          description="Read and edit it in Workspace."
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

function preview(file: MemoryFileItem): string {
  return file.description || file.content.split("\n").find((line) => line.trim())?.trim() || "Empty";
}

function FileRow({ file, onEdit, onDelete }: { file: MemoryFileItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group/row flex items-center gap-1 pr-3 transition-colors duration-150 hover:bg-surface">
      {file.undecryptable ? (
        <div className="flex min-h-[4.25rem] min-w-0 flex-1 items-center px-4 text-[15px]">
          <Undecryptable />
        </div>
      ) : (
        <button type="button" onClick={onEdit} className="min-h-[4.25rem] min-w-0 flex-1 cursor-pointer px-4 py-3 text-left">
          <span className="block truncate text-[15px] tracking-[-0.01em]">{file.name}</span>
          <span className="mt-1 block truncate text-[13px] text-muted">{preview(file)}</span>
        </button>
      )}
      <RowMenu
        label={file.undecryptable ? "Actions for this file" : `Actions for ${file.name}`}
        items={[
          ...(file.undecryptable ? [] : [{ label: "Edit", icon: <Pencil className="size-3.5" />, onSelect: onEdit }, { type: "separator" as const }]),
          { label: "Delete file", icon: <Trash className="size-3.5" />, danger: true, onSelect: onDelete },
        ]}
      />
    </div>
  );
}

function Files({ category, onAdd, onEdit, onDelete }: { category: MemoryCategoryItem; onAdd: () => void; onEdit: (file: MemoryFileItem) => void; onDelete: (id: string) => void }) {
  return (
    <ul className="flex flex-col pb-2 pl-10 pr-2">
      {category.files.map((f) => (
        <li key={f.id} className="overflow-hidden rounded-xl">
          <FileRow file={f} onEdit={() => onEdit(f)} onDelete={() => onDelete(f.id)} />
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-4 text-left text-[13.5px] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
        >
          <Plus className="size-3.5" />
          Add file
        </button>
      </li>
    </ul>
  );
}

function Category({ category, actions, isTaken }: { category: MemoryCategoryItem; actions: MemoryActions; isTaken: (name: string) => boolean }) {
  const [open, setOpen] = React.useState(false);
  // "new" while creating a file; otherwise the file being edited.
  const [fileDialog, setFileDialog] = React.useState<MemoryFileItem | "new" | null>(null);
  const [justCreated, setJustCreated] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const label = category.undecryptable ? "this category" : category.name;
  const editing = fileDialog !== "new" ? fileDialog ?? undefined : undefined;

  const addFile = () => {
    setJustCreated(false);
    setFileDialog("new");
  };
  const closeFile = () => setFileDialog(null);

  return (
    <div>
      <div className="group/row flex items-center gap-1 pr-3 transition-colors duration-150 hover:bg-surface">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[4.25rem] min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 text-left"
        >
          <ChevronDown className={cx("size-3.5 shrink-0 text-muted transition-transform duration-300 ease-out-soft", !open && "-rotate-90")} />
          {!category.undecryptable && <Folder className="size-4 shrink-0 text-muted" />}
          <span className="min-w-0 flex-1">
            <span className="flex text-[15px] tracking-[-0.01em]">
              {category.undecryptable ? <Undecryptable /> : <span className="truncate">{category.name}</span>}
            </span>
            <span className="mt-1 block font-mono text-[11.5px] text-muted tabular-nums">
              {category.files.length === 1 ? "1 file" : `${category.files.length} files`}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={addFile}
          aria-label={`Add a file to ${label}`}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
        >
          <Plus className="size-4" />
        </button>
        <RowMenu
          label={`Actions for ${label}`}
          items={[
            { label: "Add file", icon: <Plus className="size-3.5" />, onSelect: addFile },
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
            <Files
              category={category}
              onAdd={addFile}
              onEdit={(f) => {
                setJustCreated(false);
                setFileDialog(f);
              }}
              onDelete={actions.deleteFile}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <FileDialog
        open={fileDialog !== null}
        category={category.name}
        file={editing}
        justCreated={justCreated}
        onSave={async (fields) => {
          setOpen(true);
          if (editing) {
            actions.updateFile(editing.id, fields);
            closeFile();
            return;
          }
          const id = await actions.createFile(category.id, fields.name, fields.description);
          if (!id) return;
          setJustCreated(true);
          setFileDialog({ id, ...fields, content: "" });
        }}
        onDelete={
          editing
            ? () => {
                actions.deleteFile(editing.id);
                closeFile();
              }
            : undefined
        }
        onClose={closeFile}
      />
      <CategoryDialog
        open={renaming}
        title="Rename category"
        initial={category.name}
        confirm="Rename"
        isTaken={isTaken}
        onSave={(n) => actions.renameCategory(category.id, n)}
        onClose={() => setRenaming(false)}
      />
    </div>
  );
}

/** Workspace → Memory: the categories and files ordinary chats read from. */
export function MemoryFiles({ categories, actions, off, onTurnOn, onTalkWithKarui }: MemoryFilesProps) {
  const [adding, setAdding] = React.useState(false);
  const isTaken = (name: string) => !!categories?.some((c) => c.name.trim().toLowerCase() === name.toLowerCase());

  return (
    <>
      <CategoryDialog open={adding} title="New category" confirm="Create" isTaken={isTaken} onSave={actions.createCategory} onClose={() => setAdding(false)} />

      <PageActions>
        <Menu
          label="New"
          sheetTitle="New"
          items={[
            { label: "Talk with Karui", icon: <MessageSquare className="size-3.5" />, onSelect: onTalkWithKarui },
            { label: "New category", icon: <Folder className="size-3.5" />, onSelect: () => setAdding(true) },
          ]}
        >
          {({ open, triggerProps }) => (
            <Button {...triggerProps} disabled={categories === null} className={PAGE_ACTION}>
              <Plus className="size-3.5" />
              New
              <ChevronDown className={cx("size-3.5 transition-transform duration-200 ease-out-soft", open && "rotate-180")} />
            </Button>
          )}
        </Menu>
      </PageActions>

      {off && (
        <div className="mb-8 flex items-center justify-between gap-3 rounded-2xl border border-line-strong py-2.5 pl-4 pr-2.5">
          <span className="text-[14.5px] tracking-[-0.01em]">Memory is off</span>
          <Button variant="secondary" onClick={onTurnOn}>
            Turn on
          </Button>
        </div>
      )}

      {categories === null ? (
        <ul aria-label="Loading memory" className="flex flex-col gap-1">
          {[40, 55, 35].map((w, i) => (
            <li key={i} className="flex min-h-[4.25rem] flex-col justify-center gap-2 px-4">
              <span className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
              <span className="h-2.5 w-16 animate-pulse rounded-full bg-surface-2" />
            </li>
          ))}
        </ul>
      ) : categories.length === 0 ? (
        <p className="px-4 py-6 text-[15px] text-muted">Nothing saved yet.</p>
      ) : (
        <ul className={LIST_FRAME}>
          {categories.map((c) => (
            <li key={c.id}>
              <Category category={c} actions={actions} isTaken={isTaken} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
