"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Lock,
  RotateCcw,
} from "@/components/kit/icons";
import { LogoMark } from "@/components/kit/Logo";
import { Spinner } from "@/components/kit/Spinner";
import type { ArtifactType } from "@/lib/artifacts";
import { cx } from "@/lib/cx";
import { Markdown } from "./Markdown";
import { Processing, type ProcessingStep } from "./Processing";
import { Preparation, type PreparationSegment } from "./Preparation";
import type { QuestionData } from "./Questions";

export type UserMessageData = {
  id: string;
  role: "user";
  text: string;
  quote?: string | null;
  images?: { src: string; name: string }[];
  files?: { name: string; meta?: string }[];
  decryptionFailed?: boolean;
};

export type ArtifactData = {
  id: string;
  title: string;
  type: ArtifactType;
  streaming?: boolean;
  /** An edit carries only the changes, not a document: there's nothing to download or open from the message. */
  edit?: boolean;
  /** Project chats only. */
  library?: { path: string; saved: boolean; saving?: boolean; change?: ArtifactChange };
};

export type ArtifactChange = { kind: "updated" } | { kind: "edited"; count: number } | { kind: "failed"; reason: string };

export type SkillDraftData = {
  id: string;
  name: string;
  description: string;
  content: string;
  status: "new" | "update" | "saved";
  saving?: boolean;
  streaming?: boolean;
};

export type AssistantMessageData = {
  id: string;
  role: "assistant";
  text: string;
  steps?: ProcessingStep[];
  preparation?: PreparationSegment[];
  artifacts?: ArtifactData[];
  skills?: SkillDraftData[];
  /** Asked at the end of the answer; shown in place of the composer while this is the latest message. */
  questions?: QuestionData[];
  model?: string;
  streaming?: boolean;
  status?: string | null;
  error?: string | null;
  variant?: { index: number; total: number };
  decryptionFailed?: boolean;
};

export type MessageData = UserMessageData | AssistantMessageData;

const spring = { type: "spring", bounce: 0, duration: 0.45 } as const;

function ActionButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-fg active:scale-[0.92]"
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <ActionButton
      label={done ? "Copied" : "Copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {}
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={done ? "done" : "copy"}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", bounce: 0, duration: 0.25 }}
          className="grid place-items-center"
        >
          {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </motion.span>
      </AnimatePresence>
    </ActionButton>
  );
}

function Undecryptable() {
  return (
    <p className="flex items-center gap-2 text-[14px] italic text-muted">
      <Lock className="size-3.5" />
      This message can&apos;t be decrypted on this device.
    </p>
  );
}

export function UserMessage({ message, enter = true }: { message: UserMessageData; enter?: boolean }) {
  const reduce = useReducedMotion();
  const hasMedia = !!message.images?.length || !!message.files?.length;

  return (
    <motion.div
      initial={!enter ? false : reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className="group/msg flex flex-col items-end gap-2"
    >
      {hasMedia && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
          {message.images?.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.src} src={img.src} alt={img.name} className="size-28 rounded-2xl border border-line object-cover" />
          ))}
          {message.files?.map((f) => (
            <span key={f.name} className="flex h-14 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5">
              <FileText className="text-muted" />
              <span>
                <span className="block max-w-[180px] truncate text-[13px] font-medium">{f.name}</span>
                {f.meta && <span className="block font-mono text-[11px] text-muted">{f.meta}</span>}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flex max-w-[85%] items-end gap-1">
        <div className="opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
          {!message.decryptionFailed && <CopyButton text={message.text} />}
        </div>
        <div className="min-w-0 origin-bottom-right rounded-[20px] rounded-br-md bg-surface-2 px-4 py-2.5 text-[0.9375rem] leading-relaxed">
          {message.decryptionFailed ? (
            <Undecryptable />
          ) : (
            <>
              {message.quote && (
                <p className="mb-2 line-clamp-3 border-l-2 border-line-strong pl-3 text-[13.5px] text-muted">{message.quote}</p>
              )}
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function changeStatus(change: ArtifactChange, path: string): string {
  if (change.kind === "failed") return `Not changed · ${change.reason}`;
  if (change.kind === "updated") return `Updated · ${path}`;
  return `Edited · ${change.count === 1 ? "1 change" : `${change.count} changes`} · ${path}`;
}

function artifactStatus({ type, streaming, library }: ArtifactData): string {
  const kind = type === "markdown" ? "Note" : "Document";
  if (streaming) return library?.change ? "Changing the Library file…" : `Writing ${kind.toLowerCase()}…`;
  if (!library) return type === "markdown" ? "Note · Markdown" : "Document · HTML";
  if (library.change) return changeStatus(library.change, library.path);
  if (library.saving) return "Saving to the Library…";
  return library.saved ? `In the Library · ${library.path}` : `${kind} · not in the Library`;
}

const pill =
  "flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-[background-color,opacity,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none";

function ArtifactCard({
  artifact,
  onOpen,
  onDownload,
  onSave,
}: {
  artifact: ArtifactData;
  onOpen?: (a: ArtifactData) => void;
  onDownload?: (a: ArtifactData) => void;
  onSave?: (a: ArtifactData) => void;
}) {
  const { library } = artifact;
  const status = artifactStatus(artifact);
  const failed = library?.change?.kind === "failed";
  // A change lives in the Library file: without it there's nothing to open, and nothing to save.
  const canSave = library && !library.saved && !library.change && onSave;
  const canOpen = onOpen && (!(artifact.edit || library?.change) || library?.saved);
  return (
    <div className="my-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-elevated p-3 pr-4 shadow-soft">
      <div aria-hidden="true" className="flex h-16 w-14 shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-bg p-2">
        <span className="h-1.5 w-3/4 rounded-full bg-line-strong" />
        <span className="h-1 w-full rounded-full bg-line" />
        <span className="h-1 w-5/6 rounded-full bg-line" />
        <span className="h-1 w-full rounded-full bg-line" />
        <span className="h-1 w-2/3 rounded-full bg-line" />
      </div>
      <div className="min-w-[9rem] flex-1">
        <p className="truncate text-[14.5px] font-medium tracking-[-0.01em]">{artifact.title}</p>
        <p
          title={status}
          className={cx(
            "mt-0.5 truncate font-mono text-[11.5px]",
            failed ? "text-danger" : "text-muted",
            (artifact.streaming || library?.saving) && "text-shimmer",
          )}
        >
          {status}
        </p>
      </div>
      {!artifact.streaming && (
        <div className="ml-auto flex items-center gap-1">
          {onDownload && !artifact.edit && (
            <ActionButton label="Download" onClick={() => onDownload(artifact)}>
              <Download className="size-3.5" />
            </ActionButton>
          )}
          {canSave && (
            <button
              type="button"
              onClick={() => onSave(artifact)}
              disabled={library.saving}
              className={cx(pill, "mr-1 bg-inverse text-on-inverse hover:opacity-85")}
            >
              {library.saving && <Spinner inverse className="size-3" />}
              Save to Library
            </button>
          )}
          {canOpen && (
            <button
              type="button"
              onClick={() => onOpen(artifact)}
              className={cx(pill, "bg-elevated ring-1 ring-inset ring-line-strong hover:bg-surface")}
            >
              Open
              <ArrowUpRight className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SKILL_STATUS = { new: "Skill · not saved", update: "Skill · replaces yours", saved: "Skill · in your skills" } as const;
const LONG_SKILL = 480;

function SkillCard({ skill, onSave }: { skill: SkillDraftData; onSave?: (s: SkillDraftData) => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const long = skill.content.length > LONG_SKILL;
  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-line bg-elevated shadow-soft">
      <div className="flex items-center gap-4 p-3 pr-4">
        <div aria-hidden="true" className="grid h-16 w-14 shrink-0 place-items-center rounded-lg border border-line bg-bg">
          <BookOpen className="size-5 text-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium tracking-[-0.01em]">{skill.name}</p>
          <p className={cx("mt-0.5 font-mono text-[11.5px] text-muted", skill.streaming && "text-shimmer")}>
            {skill.streaming ? "Writing skill…" : onSave ? SKILL_STATUS[skill.status] : "Skill"}
          </p>
        </div>
        {onSave &&
          !skill.streaming &&
          (skill.status === "saved" ? (
            <span className="flex h-8 items-center gap-1.5 px-1 text-[13px] text-muted">
              <Check className="size-3.5" />
              Saved
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSave(skill)}
              disabled={skill.saving}
              aria-busy={skill.saving || undefined}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-inverse px-3.5 text-[13px] font-medium text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97] disabled:pointer-events-none"
            >
              {skill.saving && <Spinner tone="inverse" className="size-3.5" />}
              {skill.status === "update" ? "Update skill" : "Save skill"}
            </button>
          ))}
      </div>
      {!skill.streaming && (
        <div className="border-t border-line px-4 pb-2 pt-3.5">
          <p className="text-pretty text-[13.5px] leading-relaxed text-muted">{skill.description}</p>
          <div className="relative mt-3">
            <pre
              className={cx(
                "whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-fg/90 [overflow-wrap:anywhere]",
                long && !expanded && "max-h-36 overflow-hidden",
              )}
            >
              {skill.content}
            </pre>
            {long && !expanded && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-elevated" />
            )}
          </div>
          {long ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 h-8 cursor-pointer text-[13px] font-medium text-muted transition-colors duration-150 hover:text-fg"
            >
              {expanded ? "Show less" : "Show all"}
            </button>
          ) : (
            <div className="h-1.5" />
          )}
        </div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-fg [animation:caret_1s_steps(1)_infinite]"
    />
  );
}

export function AssistantMessage({
  message,
  isLast,
  enter = true,
  onRetry,
  onVariant,
  onOpenArtifact,
  onDownloadArtifact,
  onSaveArtifact,
  onSaveSkill,
}: {
  message: AssistantMessageData;
  isLast?: boolean;
  enter?: boolean;
  onRetry?: () => void;
  onVariant?: (dir: -1 | 1) => void;
  onOpenArtifact?: (a: ArtifactData) => void;
  onDownloadArtifact?: (a: ArtifactData) => void;
  onSaveArtifact?: (a: ArtifactData) => void;
  /** Absent in incognito, where nothing is saved to the account. */
  onSaveSkill?: (s: SkillDraftData) => void;
}) {
  const reduce = useReducedMotion();
  const busy = message.streaming;
  const v = message.variant;

  return (
    <motion.div
      initial={!enter ? false : reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="group/msg flex gap-4"
    >
      <LogoMark className="mt-[3px] size-5 shrink-0" />

      <div className="min-w-0 flex-1">
        {message.preparation ? (
          <Preparation segments={message.preparation} status={busy ? message.status : null} />
        ) : (
          <Processing steps={message.steps ?? []} status={busy ? message.status : null} />
        )}

        {message.decryptionFailed ? (
          <Undecryptable />
        ) : (
          <div
            data-answer
            className={cx("text-[0.9375rem] leading-[1.75] [overflow-wrap:anywhere]", busy && message.text && "stream-caret")}
          >
            {message.text ? <Markdown>{message.text}</Markdown> : busy && !message.status && <Caret />}
          </div>
        )}

        {message.artifacts?.map((a) => (
          <ArtifactCard key={a.id} artifact={a} onOpen={onOpenArtifact} onDownload={onDownloadArtifact} onSave={onSaveArtifact} />
        ))}

        {message.skills?.map((s) => (
          <SkillCard key={s.id} skill={s} onSave={onSaveSkill} />
        ))}

        {message.error && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-danger/40 bg-danger/[0.06] py-2.5 pl-4 pr-2 text-[13.5px]">
            <p className="flex items-center gap-2">
              <AlertCircle className="size-3.5 text-danger" />
              {message.error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="h-8 shrink-0 cursor-pointer rounded-full px-3 font-medium transition-colors duration-150 hover:bg-danger/10"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {!busy && !message.error && (
          <div
            className={cx(
              "-ml-2 mt-3 flex items-center gap-0.5 transition-opacity duration-150",
              isLast ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100",
            )}
          >
            {!message.decryptionFailed && <CopyButton text={message.text} />}
            {onRetry && (
              <ActionButton label="Retry" onClick={onRetry}>
                <RotateCcw className="size-3.5" />
              </ActionButton>
            )}
            {v && v.total > 1 && (
              <div className="ml-1 flex items-center font-mono text-[11.5px] text-muted">
                <ActionButton label="Previous answer" onClick={() => onVariant?.(-1)}>
                  <ChevronLeft className="size-3.5" />
                </ActionButton>
                <span className="min-w-8 text-center tabular-nums">
                  {v.index}/{v.total}
                </span>
                <ActionButton label="Next answer" onClick={() => onVariant?.(1)}>
                  <ChevronRight className="size-3.5" />
                </ActionButton>
              </div>
            )}
            {message.model && <span className="ml-2 font-mono text-[11.5px] text-muted">{message.model}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}
