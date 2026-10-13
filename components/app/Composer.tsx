"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Switch } from "@/components/kit/Controls";
import { ArrowUp, Camera, ChevronRight, FileText, Folder, FolderInput, Globe, ImageIcon, Layers, Paperclip, Plus, X } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Sheet } from "@/components/kit/Sheet";
import { Spinner } from "@/components/kit/Spinner";
import { useMediaQuery } from "@/components/kit/useMounted";
import { cx } from "@/lib/cx";
import { ModelPicker } from "./ModelPicker";

export type ComposerAttachment = { id: string; kind: "image" | "file"; name: string; src?: string; meta?: string };

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

const addButtonClass = (open: boolean): string =>
  cx(
    "grid size-9 cursor-pointer place-items-center rounded-full transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-fg active:scale-[0.94]",
    open ? "bg-surface text-fg" : "text-muted",
  );

function AddIcon({ open }: { open: boolean }) {
  return <Plus className={cx("size-[18px] transition-transform duration-300 ease-out-soft", open && "rotate-45")} />;
}

function Chip({ icon, label, undo, onClick }: { icon: React.ReactNode; label: string; undo: string; onClick: () => void }) {
  return (
    <motion.button
      layout
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
      transition={spring}
      className="group/chip flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-surface-2 pl-3 pr-2.5 text-[13px] tracking-[-0.01em] text-fg ring-1 ring-inset ring-line-strong active:scale-[0.97]"
    >
      {icon}
      <span className="max-w-[10rem] truncate">{label}</span>
      <span className="sr-only">, {undo}</span>
      <X className="size-3 text-muted transition-colors duration-150 group-hover/chip:text-fg" />
    </motion.button>
  );
}

function SheetRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-muted">{icon}</span>
      <span className="flex-1 text-[15px] font-medium tracking-[-0.01em]">{label}</span>
      {children}
    </>
  );
}

export function Composer({
  value,
  onChange,
  onSubmit,
  sending,
  onStop,
  placeholder = "Ask anything, privately…",
  attachments = [],
  accept,
  imageAccept = "image/*",
  fileAccept,
  imagesEnabled = true,
  attachNote,
  onAttach,
  onRemoveAttachment,
  webSearch,
  memory,
  project,
  model,
  quote,
  onClearQuote,
  onPaste,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  sending?: boolean;

  onStop?: () => void;
  placeholder?: string;
  attachments?: ComposerAttachment[];
  accept?: string;
  imageAccept?: string;
  fileAccept?: string;
  imagesEnabled?: boolean;
  attachNote?: string;
  onAttach?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  webSearch?: { on: boolean; onToggle: () => void };
  memory?: { on: boolean; onToggle: () => void };
  project?: { name: string | null; onPick: () => void; onClear?: () => void };
  model?: React.ComponentProps<typeof ModelPicker>;
  quote?: string | null;
  onClearQuote?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
}) {
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const photosRef = React.useRef<HTMLInputElement>(null);
  const docsRef = React.useRef<HTMLInputElement>(null);
  const mobile = useMediaQuery("(max-width: 639px)");
  const [addOpen, setAddOpen] = React.useState(false);

  const projectLabel = project?.name && !project.onClear ? "Move to project" : "Add to project";
  const adds: MenuItem[] = [];
  if (onAttach)
    adds.push({
      label: imagesEnabled ? "Add photos & files" : "Add files",
      icon: <Paperclip />,
      onSelect: () => fileRef.current?.click(),
    });
  if (project) adds.push({ label: projectLabel, icon: <FolderInput />, onSelect: project.onPick });
  const toggles: MenuItem[] = [];
  if (webSearch) toggles.push({ label: "Web search", icon: <Globe />, checked: webSearch.on, onSelect: webSearch.onToggle });
  if (memory) toggles.push({ label: "Use memory", icon: <Layers />, checked: memory.on, onSelect: memory.onToggle });
  const addItems: MenuItem[] = [...adds, ...(adds.length && toggles.length ? [{ type: "separator" as const }] : []), ...toggles];

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onAttach?.(files);
    e.target.value = "";
    setAddOpen(false);
  };
  const canSend = !sending && (value.trim().length > 0 || attachments.length > 0);

  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [value]);

  const submit = () => {
    if (canSend) onSubmit();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) textRef.current?.focus();
      }}
      className="rounded-[22px] border border-line-strong bg-elevated shadow-soft transition-[border-color] duration-200 focus-within:border-fg/30"
    >
      <AnimatePresence initial={false}>
        {quote && (
          <motion.div
            key="quote"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="mx-3 mt-3 flex items-start gap-3 rounded-xl bg-surface py-2.5 pl-3.5 pr-2">
              <span aria-hidden="true" className="mt-0.5 w-0.5 self-stretch rounded-full bg-line-strong" />
              <p className="line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-relaxed text-muted">{quote}</p>
              {onClearQuote && (
                <button
                  type="button"
                  onClick={onClearQuote}
                  aria-label="Remove quote"
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {attachments.length > 0 && (
          <motion.div
            key="attachments"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <ul className="flex flex-wrap gap-2 px-3 pt-3">
              <AnimatePresence initial={false} mode="popLayout">
                {attachments.map((a) => (
                  <motion.li
                    key={a.id}
                    layout
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
                    transition={spring}
                    className="group/att relative"
                  >
                    {a.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.src}
                        alt={a.name}
                        className="size-16 rounded-xl border border-line object-cover"
                      />
                    ) : (
                      <span className="flex h-16 max-w-[220px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3">
                        <FileText className="text-muted" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{a.name}</span>
                          {a.meta && <span className="block font-mono text-[11px] text-muted">{a.meta}</span>}
                        </span>
                      </span>
                    )}
                    {onRemoveAttachment && (
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(a.id)}
                        aria-label={`Remove ${a.name}`}
                        className="absolute -right-1.5 -top-1.5 grid size-6 cursor-pointer place-items-center rounded-full border border-line bg-elevated text-muted shadow-soft transition-[opacity,color,transform] duration-150 hover:text-fg active:scale-90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/att:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <label htmlFor="composer-input" className="sr-only">
        Message
      </label>
      <textarea
        data-focus="within"
        id="composer-input"
        ref={textRef}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="block max-h-[40vh] min-h-[3.5rem] w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[1.0625rem] leading-relaxed tracking-[-0.01em] text-fg outline-none placeholder:text-subtle focus-visible:outline-none"
      />

      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        {onAttach && (
          <>
            <input ref={fileRef} type="file" multiple accept={accept} className="hidden" onChange={pick} />
            <input ref={cameraRef} type="file" accept={imageAccept} capture="environment" className="hidden" onChange={pick} />
            <input ref={photosRef} type="file" multiple accept={imageAccept} className="hidden" onChange={pick} />
            <input ref={docsRef} type="file" multiple accept={fileAccept} className="hidden" onChange={pick} />
          </>
        )}

        {addItems.length > 0 &&
          (mobile ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Add"
              aria-haspopup="dialog"
              className={addButtonClass(addOpen)}
            >
              <AddIcon open={addOpen} />
            </button>
          ) : (
            <Menu label="Add" items={addItems} placement="top-start" panelClassName="w-[224px]">
              {({ open, triggerProps }) => (
                <button {...triggerProps} aria-label="Add" className={addButtonClass(open)}>
                  <AddIcon open={open} />
                </button>
              )}
            </Menu>
          ))}

        <Sheet open={addOpen && mobile} onClose={() => setAddOpen(false)} title="Add">
          {onAttach && (
            <div className="grid grid-cols-3 gap-2.5 px-4 pt-3">
              {[
                { label: "Camera", icon: <Camera className="size-6" />, ref: cameraRef, show: imagesEnabled },
                { label: "Photos", icon: <ImageIcon className="size-6" />, ref: photosRef, show: imagesEnabled },
                { label: "Files", icon: <FileText className="size-6" />, ref: docsRef, show: true },
              ]
                .filter((t) => t.show)
                .map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => t.ref.current?.click()}
                    className="flex aspect-[5/4] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl bg-surface text-[13.5px] font-medium tracking-[-0.01em] transition-[background-color,transform] duration-150 active:scale-[0.96] active:bg-surface-2"
                  >
                    <span className="text-muted">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
            </div>
          )}
          {onAttach && attachNote && <p className="px-5 pt-3 text-center font-mono text-[11px] text-muted">{attachNote}</p>}
          {(webSearch || memory || project) && (
            <div className="mx-4 mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
              {webSearch && (
                <label className="flex h-14 cursor-pointer items-center gap-3 pl-4 pr-3">
                  <SheetRow icon={<Globe className="size-5" />} label="Web search">
                    <Switch checked={webSearch.on} onChange={webSearch.onToggle} label="Web search" />
                  </SheetRow>
                </label>
              )}
              {memory && (
                <label className="flex h-14 cursor-pointer items-center gap-3 pl-4 pr-3">
                  <SheetRow icon={<Layers className="size-5" />} label="Use memory">
                    <Switch checked={memory.on} onChange={memory.onToggle} label="Use memory" />
                  </SheetRow>
                </label>
              )}
              {project && (
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    project.onPick();
                  }}
                  className="flex h-14 w-full cursor-pointer items-center gap-3 pl-4 pr-3 text-left transition-colors duration-150 active:bg-surface-2"
                >
                  <SheetRow icon={<FolderInput className="size-5" />} label={projectLabel}>
                    {project.name && <span className="max-w-[8rem] truncate text-[14px] text-muted">{project.name}</span>}
                    <ChevronRight className="size-4 text-muted" />
                  </SheetRow>
                </button>
              )}
            </div>
          )}
        </Sheet>

        <div className="-my-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none]">
          <AnimatePresence initial={false} mode="popLayout">
            {project?.name && project.onClear && (
              <Chip
                key="project"
                icon={<Folder className="size-[15px]" />}
                label={project.name}
                undo="remove project"
                onClick={project.onClear}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {model && <ModelPicker {...model} />}
          {/* Separate keys: a reused <button> turns type="submit" mid-click on Stop and sends the restored draft. */}
          {sending && onStop ? (
            <button
              key="stop"
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-inverse text-on-inverse transition-[background-color,color,transform] duration-200 active:scale-[0.92]"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              key="send"
              type="submit"
              disabled={!canSend && !sending}
              aria-label={sending ? "Sending" : "Send message"}
              className={cx(
                "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-[0.92] disabled:cursor-default",
                canSend || sending ? "bg-inverse text-on-inverse" : "bg-surface-2 text-subtle",
              )}
            >
              {sending ? <Spinner inverse className="size-3.5" /> : <ArrowUp className="size-4" />}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
