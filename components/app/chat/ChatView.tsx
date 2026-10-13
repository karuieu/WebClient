"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { ArrowDown, ChevronDown, Folder, FolderInput, Incognito, PanelRight, Pencil, Quote, ShieldCheck, Sliders, Star, Trash } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Spinner } from "@/components/kit/Spinner";
import { Enter, cascade } from "@/components/kit/Enter";
import { cx } from "@/lib/cx";
import { Composer } from "../Composer";
import { ShellContext } from "../AppShell";
import { ArtifactPanel, type ArtifactPanelData } from "./ArtifactPanel";
import { AssistantMessage, UserMessage, type ArtifactData, type MessageData, type SkillDraftData } from "./Messages";
import { QuestionCard, type QuestionsData } from "./Questions";

export type EnclaveState = { provider: string; state: "verifying" | "verified" | "unverified" };

export type CompressionGateData = {
  blockedUntil?: string | null;
  compressing?: boolean;
  onCompress: () => void;
};

function EnclaveBadge({ enclave }: { enclave: EnclaveState }) {
  return (
    <p className="flex h-8 items-center gap-2 rounded-full border border-line px-3 text-[12px] font-medium">
      {enclave.state === "verifying" && (
        <>
          <Spinner className="size-3" />
          <span className="text-muted">Verifying enclave…</span>
        </>
      )}
      {enclave.state === "verified" && (
        <>
          <span className="size-1.5 rounded-full bg-ok [animation:pulse-dot_2s_ease-out_infinite]" aria-hidden="true" />
          {enclave.provider} · attested
        </>
      )}
      {enclave.state === "unverified" && (
        <>
          <ShieldCheck className="size-3.5 text-muted" />
          <span className="text-muted">{enclave.provider} enclave</span>
        </>
      )}
    </p>
  );
}

type ChatActions = { onStar: () => void; onRename: (t: string) => void; onMove: () => void; onDelete: () => void };

export type HeaderProject = {
  name: string;

  href: string;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onOpenSettings: () => void;
};

const iconButton =
  "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-fg active:scale-[0.94]";

export function ChatHeader({
  title,
  starred,
  enclave,
  actions,
  project,
}: {
  title: string;
  starred?: boolean;
  enclave?: EnclaveState;
  actions?: ChatActions;
  project?: HeaderProject;
}) {
  const { sidebarHidden } = React.useContext(ShellContext);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== title) actions?.onRename(t);
    else setDraft(title);
  };

  const items: MenuItem[] = !actions
    ? []
    : [
        { label: starred ? "Unstar" : "Star", icon: <Star filled={starred} className="size-3.5" />, onSelect: actions.onStar },
        {
          label: "Rename",
          icon: <Pencil className="size-3.5" />,
          onSelect: () => {
            setDraft(title);
            setEditing(true);
          },
        },
        { label: "Move to project", icon: <FolderInput className="size-3.5" />, onSelect: actions.onMove },
        { type: "separator" },
        { label: "Delete chat", icon: <Trash className="size-3.5" />, danger: true, onSelect: actions.onDelete },
      ];

  return (
    <header
      className={cx(
        "@container sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 bg-bg/80 pr-3 backdrop-blur-xl backdrop-saturate-150 transition-[padding] duration-300 [mask-image:linear-gradient(to_bottom,black_75%,transparent)] md:pr-4",
        sidebarHidden ? "pl-3 md:pl-14" : "pl-3 md:pl-4",
      )}
    >
      <div className="flex min-w-0 items-center">
        {project &&
          (title ? (
            <>
              <Link
                href={project.href}
                title={`New chat in ${project.name}`}
                className="flex h-9 min-w-0 max-w-[45%] shrink-0 items-center gap-2 rounded-xl px-3 text-[14px] tracking-[-0.01em] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
              >
                <Folder className="size-3.5 shrink-0" />
                <span className="truncate">{project.name}</span>
              </Link>
              <span aria-hidden="true" className="-mx-1 shrink-0 text-[14px] text-subtle">
                /
              </span>
            </>
          ) : (
            <p className="flex h-9 min-w-0 items-center gap-2 px-3 text-[14px] font-medium tracking-[-0.01em]">
              <Folder className="size-3.5 shrink-0 text-muted" />
              <span className="truncate">{project.name}</span>
            </p>
          ))}
        {project && !title ? null : !actions ? (
          <p className="flex h-9 items-center gap-2 px-3 text-[14px] font-medium tracking-[-0.01em]">
            <Incognito className="size-4 shrink-0 text-muted" />
            <span className="truncate">{title}</span>
            <span className="font-mono text-[11px] font-normal text-muted max-sm:hidden">Not saved</span>
          </p>
        ) : editing ? (
          <input
            ref={inputRef}
            data-focus="within"
            aria-label="Chat title"
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(title);
                setEditing(false);
              }
            }}
            className="h-9 w-[min(28rem,60vw)] rounded-xl bg-elevated px-3 text-[14px] font-medium tracking-[-0.01em] outline-none ring-1 ring-line-strong"
          />
        ) : (
          <Menu label="Chat" items={items} placement="bottom-start" className="min-w-0">
            {({ open, triggerProps }) => (
              <button
                {...triggerProps}
                className={cx(
                  "flex h-9 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium tracking-[-0.01em] transition-colors duration-150",
                  open ? "bg-surface" : "hover:bg-surface",
                )}
              >
                {starred && <Star filled className="size-3 shrink-0 text-muted" />}
                <span className="truncate">{title}</span>
                <ChevronDown className={cx("size-3.5 shrink-0 text-muted transition-transform duration-300", open && "rotate-180")} />
              </button>
            )}
          </Menu>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {enclave && (
          <div className="mr-1 @max-[34rem]:hidden">
            <EnclaveBadge enclave={enclave} />
          </div>
        )}
        {project && (
          <>
            <button type="button" onClick={project.onOpenSettings} aria-label="Project settings" title="Project settings" className={iconButton}>
              <Sliders className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={project.onTogglePanel}
              aria-label="Show project panel"
              title="Show project panel"
              className={cx(iconButton, project.panelOpen && "md:hidden")}
            >
              <PanelRight className="size-[18px]" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function SelectionReply({ onReply }: { onReply: (text: string) => void }) {
  const [pos, setPos] = React.useState<{ x: number; y: number; text: string } | null>(null);

  React.useEffect(() => {
    const evaluate = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!sel || !text || sel.rangeCount === 0) return setPos(null);
      const range = sel.getRangeAt(0);
      const host = (range.commonAncestorContainer as Element).parentElement ?? (range.commonAncestorContainer as Element);
      if (!host?.closest?.("[data-answer]")) return setPos(null);
      const r = range.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top, text });
    };
    const onUp = () => requestAnimationFrame(evaluate);
    const hide = () => setPos(null);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("keyup", onUp);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("keyup", onUp);
      document.removeEventListener("scroll", hide, true);
    };
  }, []);

  return (
    <AnimatePresence>
      {pos && (
        <motion.button
          key="reply"
          type="button"
          initial={{ opacity: 0, y: 4, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
          transition={{ type: "spring", bounce: 0, duration: 0.25 }}
          style={{ left: pos.x, top: pos.y - 8 }}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            onReply(pos.text);
            window.getSelection()?.removeAllRanges();
            setPos(null);
          }}
          className="fixed z-50 flex h-8 -translate-x-1/2 -translate-y-full cursor-pointer items-center gap-1.5 rounded-full bg-inverse px-3 text-[12.5px] font-medium text-on-inverse shadow-soft"
        >
          <Quote className="size-3.5" />
          Reply
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function CompressionGate({ gate }: { gate: CompressionGateData }) {
  const blocked = !!gate.blockedUntil;
  return (
    <div className="rounded-[22px] border border-line-strong bg-elevated p-5 shadow-soft">
      <p className="text-[15px] font-medium tracking-[-0.01em]">This conversation has grown long.</p>
      <p className="mt-1.5 text-pretty text-[13.5px] leading-relaxed text-muted">
        {blocked
          ? `Condensing is available again at ${gate.blockedUntil}. You can start a new chat in the meantime.`
          : "Condense the earlier messages into a summary to keep going. The summary is encrypted like the rest of the chat."}
      </p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={gate.onCompress}
          disabled={blocked || gate.compressing}
          aria-busy={gate.compressing || undefined}
          className="relative flex h-9 cursor-pointer items-center gap-2 rounded-full bg-inverse px-4 text-[13.5px] font-medium text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97] disabled:cursor-default disabled:opacity-45"
        >
          {gate.compressing && <Spinner inverse className="size-3.5" />}
          {gate.compressing ? "Condensing…" : "Condense conversation"}
        </button>
      </div>
    </div>
  );
}

const STICK_THRESHOLD_PX = 40;
const USER_RESIZE_WINDOW_MS = 1000;
const REVEAL_COUNT = 6;

export function ChatView({
  loading = false,
  title,
  starred,
  enclave,
  messages,
  composer,
  gate,
  questions,
  chatActions,
  onQuote,
  onRetry,
  onVariant,
  onOpenArtifact,
  onDownloadArtifact,
  onSaveSkill,
  artifactPanel,
  project,
  focusMessageId,
  onFocusShown,
}: {
  loading?: boolean;
  title: string;
  starred?: boolean;
  enclave?: EnclaveState;
  messages: MessageData[];
  composer: React.ComponentProps<typeof Composer>;
  gate?: CompressionGateData | null;
  /** Karui's questions awaiting an answer; they take the composer's place. */
  questions?: QuestionsData | null;
  chatActions?: ChatActions;
  onQuote?: (text: string) => void;
  onRetry?: (messageId: string) => void;
  onVariant?: (messageId: string, dir: -1 | 1) => void;
  onOpenArtifact?: (a: ArtifactData) => void;
  onDownloadArtifact?: (a: ArtifactData) => void;
  onSaveSkill?: (s: SkillDraftData) => void;
  artifactPanel?: {
    artifact: ArtifactPanelData | null;
    onClose: () => void;
    onDownloadHtml: () => void;
    onDownloadDoc: () => void;
  };
  project?: HeaderProject;
  focusMessageId?: string | null;
  onFocusShown?: (row: HTMLElement | null) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = React.useState<{ history: Set<string>; reveal: Map<string, number> } | null>(null);
  if (!loading && loaded === null) {
    const ids = messages.map((m) => m.id);
    setLoaded({ history: new Set(ids), reveal: new Map(ids.slice(-REVEAL_COUNT).map((id, i) => [id, i])) });
  }
  const history = loaded?.history;
  const [atBottom, setAtBottom] = React.useState(true);
  const stickRef = React.useRef(true);
  const streamingRef = React.useRef(false);
  const tail = messages[messages.length - 1];
  streamingRef.current = tail?.role === "assistant" && !!tail.streaming;
  const userCount = messages.filter((m) => m.role === "user").length;

  const scrollToEnd = React.useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Unpin on user upward scrolling, but ignore scrollTop reductions caused by shrinking content.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastTop = el.scrollTop;
    let lastHeight = el.scrollHeight;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const movedUp = el.scrollTop < lastTop && el.scrollHeight >= lastHeight;
      if (movedUp) stickRef.current = false;
      else if (distance <= STICK_THRESHOLD_PX) stickRef.current = true;
      lastTop = el.scrollTop;
      lastHeight = el.scrollHeight;
      setAtBottom(distance <= STICK_THRESHOLD_PX);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    let interactedAt = -Infinity;
    const onInteract = () => {
      interactedAt = performance.now();
    };
    const ro = new ResizeObserver(() => {
      const byUser = !streamingRef.current && performance.now() - interactedAt < USER_RESIZE_WINDOW_MS;
      if (stickRef.current && !byUser) scrollToEnd();
      const bottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= STICK_THRESHOLD_PX;
      if (bottom) stickRef.current = true;
      else if (byUser) stickRef.current = false;
      setAtBottom(bottom);
    });
    content.addEventListener("pointerdown", onInteract, true);
    content.addEventListener("keydown", onInteract, true);
    ro.observe(content);
    ro.observe(scroller);
    return () => {
      ro.disconnect();
      content.removeEventListener("pointerdown", onInteract, true);
      content.removeEventListener("keydown", onInteract, true);
    };
  }, [scrollToEnd]);

  React.useEffect(() => {
    stickRef.current = true;
    scrollToEnd();
  }, [userCount, scrollToEnd]);

  // Declared after the effect above, so on first load it wins over the jump to the bottom.
  React.useEffect(() => {
    if (!focusMessageId || loading) return;
    const row = contentRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(focusMessageId)}"]`) ?? null;
    if (row) {
      stickRef.current = false;
      row.scrollIntoView({ block: "center" });
    }
    onFocusShown?.(row);
  }, [focusMessageId, loading, onFocusShown]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex min-h-0 flex-1">
      <div ref={scrollRef} className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <ChatHeader title={title} starred={starred} enclave={enclave} actions={chatActions} project={project} />

        <div ref={contentRef} className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-10 px-4 pb-10 pt-6 sm:px-6">
          {!loading && messages.length === 0 && (
            <Enter delay={150} blur={false}>
              <div className="m-auto text-center">
                <p className="text-[15px] font-medium tracking-[-0.01em]">Nothing here yet.</p>
                <p className="mt-1.5 text-[14px] text-muted">Write to Karui whenever you&apos;re ready.</p>
              </div>
            </Enter>
          )}
          {messages.map((m) => {
            const enter = !history?.has(m.id);
            const node =
              m.role === "user" ? (
                <UserMessage message={m} enter={enter} />
              ) : (
                <AssistantMessage
                  message={m}
                  isLast={m.id === lastAssistant}
                  enter={enter}
                  onRetry={onRetry && m.id === lastAssistant ? () => onRetry(m.id) : undefined}
                  onVariant={onVariant ? (d) => onVariant(m.id, d) : undefined}
                  onOpenArtifact={onOpenArtifact}
                  onDownloadArtifact={onDownloadArtifact}
                  onSaveSkill={onSaveSkill}
                />
              );
            const order = loaded?.reveal.get(m.id);
            return order === undefined ? (
              <div key={m.id} data-message-id={m.id}>
                {node}
              </div>
            ) : (
              <Enter key={m.id} delay={cascade(order, 60, 70, REVEAL_COUNT)} offset={14}>
                <div data-message-id={m.id}>{node}</div>
              </Enter>
            );
          })}
        </div>

        <div className="sticky bottom-0 z-10 bg-gradient-to-t from-bg from-60% to-transparent px-4 pb-3 pt-8 sm:px-6">
          <div className="relative mx-auto w-full max-w-[46rem]">
            <AnimatePresence>
              {!atBottom && (
                <motion.button
                  key="to-bottom"
                  type="button"
                  aria-label="Scroll to latest"
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                  onClick={() => {
                    stickRef.current = true;
                    scrollToEnd("smooth");
                  }}
                  className="absolute -top-12 left-1/2 grid size-9 -translate-x-1/2 cursor-pointer place-items-center rounded-full border border-line bg-elevated text-muted shadow-soft transition-colors duration-150 hover:text-fg"
                >
                  <ArrowDown className="size-4" />
                </motion.button>
              )}
            </AnimatePresence>
            {gate ? (
              <CompressionGate gate={gate} />
            ) : questions ? (
              <QuestionCard key={questions.id} questions={questions.questions} onAnswer={questions.onAnswer} onSkip={questions.onSkip} />
            ) : (
              <Composer {...composer} />
            )}
            <p className="mt-2.5 text-center font-mono text-[11px] text-muted">Karui can be wrong. Check what matters.</p>
          </div>
        </div>

        {onQuote && <SelectionReply onReply={onQuote} />}
      </div>
      {artifactPanel && <ArtifactPanel {...artifactPanel} />}
    </div>
  );
}
