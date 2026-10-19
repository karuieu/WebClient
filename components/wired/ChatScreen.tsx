"use client";

import * as React from "react";
import { notFound, useRouter } from "next/navigation";
import {
  compressChatNow,
  getChat,
  getCompressionGate,
  getMessages,
  invalidateSummaryForMessage,
  NotFoundError,
  setChatMemory,
  type Message,
  type ModelType,
} from "@/lib/chat";
import type { CompressionOutcome, CompressionQuota } from "@/lib/compression";
import { visibleMessages } from "@/lib/conversation";
import { StoppedError } from "@/lib/errors";
import { clearChatStream, getChatStream, startRetryStream, startSendStream, stopChatStream, subscribeChatStream } from "@/lib/chatStream";
import { takeFirstMessage, type FirstMessage } from "@/lib/handoff";
import { registerDraftRescue } from "@/lib/draftRescue";
import { clearQuoted, markQuoted } from "@/lib/quotedHighlight";
import { clearPendingFocus, peekPendingFocus, subscribePendingFocus } from "@/lib/searchFocus";
import { clearSearchTerms, markSearchTerms } from "@/lib/searchHighlight";
import { packMessageContent, type ChatImage, type ChatTextFile } from "@/lib/vision";
import { downloadArtifact } from "@/lib/artifacts";
import { saveArtifactToLibrary } from "@/lib/projectFiles";
import { toBlockquote } from "@/lib/messageBlocks";
import { getUser } from "@/lib/session";
import {
  createSkill,
  draftStatus,
  listSkills,
  SKILL_COUNT_LIMIT,
  skillFits,
  SKILLS_UPDATED_EVENT,
  updateSkill,
  type Skill,
} from "@/lib/skills";
import type { ArtifactData, SkillDraftData } from "@/components/app/chat/Messages";
import { useTabTitle } from "@/lib/tabTitle";
import { useToast } from "@/components/Toast";
import { ChatView, type HeaderProject } from "@/components/app/chat/ChatView";
import { DropOverlay } from "@/components/app/DropOverlay";
import { useComposer } from "./useComposer";
import { LibraryContext } from "./useLibrary";
import { artifactPanelOf, enclaveFor, errorText, pendingQuestions, resetTime, toViewData, type Streaming } from "./messageView";
import type { ProjectLibrary } from "./ProjectScreen";

const COMPRESSION_FAILED: Record<Exclude<CompressionOutcome, "done">, string> = {
  nothing: "There's nothing left to condense in this conversation.",
  quota: "You've used up condensing for now. Please try again after the limit resets.",
  unavailable: "Couldn't condense this conversation right now. Please try again in a moment.",
};

export type ChatInProject = {
  routeProjectId: string;
  header: HeaderProject;
  library: ProjectLibrary;
  onDocumentOpen: (open: boolean) => void;
};

export function ChatScreen({ chatId, project }: { chatId: string; project?: ChatInProject }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const library = React.useContext(LibraryContext);

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [title, setTitle] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [missing, setMissing] = React.useState(false);
  const [stream, setStream] = React.useState<Streaming>(null);
  const [selection, setSelection] = React.useState<Record<string, number>>({});
  const [quote, setQuote] = React.useState<string | null>(null);
  const [gate, setGate] = React.useState<{ required: boolean; quota: CompressionQuota | null }>({ required: false, quota: null });
  const [compressing, setCompressing] = React.useState(false);
  const [openArtifact, setOpenArtifact] = React.useState<string | null>(null);
  const [memoryOn, setMemoryOn] = React.useState(true);
  const [loadedProjectId, setLoadedProjectId] = React.useState<string | undefined>();
  // The send path reads memory_enabled from the server, so a message sent right
  // after the switch waits for it to be saved.
  const memorySave = React.useRef<Promise<void>>(Promise.resolve());

  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const selectionRef = React.useRef(selection);
  selectionRef.current = selection;
  const pendingRef = React.useRef<FirstMessage | null>(null);
  const textRef = React.useRef("");

  const composer = useComposer({ onSubmit: () => submit(), fixedModel: true });
  const setComposerModel = composer.setModel;
  textRef.current = composer.text;
  const streaming = stream !== null;
  const model = composer.model as ModelType;

  React.useEffect(() => registerDraftRescue(() => textRef.current), []);
  React.useEffect(() => clearQuoted, []);
  useTabTitle(title === "New chat" ? null : title, "Chat");

  React.useEffect(() => {
    const onRenamed = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (id === chatId) setTitle(title);
    };
    window.addEventListener("karui-chat-renamed", onRenamed);
    return () => window.removeEventListener("karui-chat-renamed", onRenamed);
  }, [chatId]);

  const focus = React.useSyncExternalStore(subscribePendingFocus, () => peekPendingFocus(chatId), () => null);
  const onFocusShown = React.useCallback(
    (row: HTMLElement | null) => {
      if (row && focus) markSearchTerms(row, focus.terms)?.startContainer.parentElement?.scrollIntoView({ block: "center" });
      clearPendingFocus();
    },
    [focus],
  );
  React.useEffect(() => clearSearchTerms, [chatId]);

  const send = React.useCallback(
    (content: string, model: ModelType, images: ChatImage[], files: ChatTextFile[], webSearch: boolean): boolean => {
      const history = visibleMessages(messagesRef.current, selectionRef.current);

      const shown = new Set(history.map((m) => m.id));
      const discard = messagesRef.current.filter((m) => m.variant_group && !shown.has(m.id)).map((m) => m.id);
      const userMessage: Message = {
        id: Date.now().toString(),
        chat_id: chatId,
        tokens: 0,
        role: "user",
        content: packMessageContent(content, images, files),
        model,
        created_at: new Date().toISOString(),
        pinned: false,
      };
      if (!startSendStream({ chatId, content, model, history, webSearch, userMessage, images, files, discard, ready: memorySave.current })) return false;
      setQuote(null);
      clearQuoted();
      clearSearchTerms();
      setMessages((prev) => [...prev, userMessage]);
      setStream({ content: "", activity: null });
      return true;
    },
    [chatId],
  );

  function submit() {
    if (composer.isEmpty || streaming || loading || getChatStream(chatId)?.phase === "streaming") return;
    const typed = composer.text.trim();
    const content = quote ? `${toBlockquote(quote)}\n\n${typed}`.trim() : typed;
    const { images, files, webSearch } = composer;
    if (send(content, model, images, files, webSearch)) composer.reset();
  }

  React.useEffect(() => {
    const sync = () => {
      const st = getChatStream(chatId);
      if (!st) return;
      if (st.phase === "streaming") {
        setStream({ content: st.content, activity: st.activity });
        const um = st.userMessage;
        if (um) setMessages((prev) => (prev.some((m) => m.id === um.id) ? prev : [...prev, um]));
        return;
      }
      clearChatStream(chatId);
      setStream(null);

      if (st.phase === "done") {
        if (st.kind === "send" && st.saved) {
          const saved = st.saved;
          const localId = st.userMessage?.id;
          const gone = new Set([localId, ...st.discarded]);
          setMessages((prev) => [...prev.filter((m) => !gone.has(m.id) && !saved.some((s) => s.id === m.id)), ...saved]);
        } else if (st.kind === "retry") {
          getMessages(chatId)
            .then((data) => {
              setMessages(data);
              const fresh = data.find((m) => m.role === "assistant" && m.variant_group && m.content === st.retryResponse);
              const group = fresh?.variant_group;
              if (group) setSelection((prev) => ({ ...prev, [group]: data.filter((m) => m.variant_group === group).length - 1 }));
            })
            .catch(() => {});
        }
        return;
      }

      const um = st.userMessage;
      if (um) {
        setMessages((prev) => prev.filter((m) => m.id !== um.id));
        if (st.kind === "send") composer.setText(st.request.content);
      }
      if (!(st.error instanceof StoppedError)) {
        showError(errorText(st.error, st.kind === "send" ? "Failed to send message" : "Failed to retry"));
      }
    };
    sync();
    return subscribeChatStream(chatId, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, showError]);

  React.useEffect(() => {
    const pending = takeFirstMessage(chatId);
    if (pending) pendingRef.current = pending;
  }, [chatId]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getMessages(chatId), getChat(chatId)])
      .then(([data, chat]) => {
        if (cancelled) return;
        setMessages(data);
        setTitle(chat.title);
        const lastModel = data.findLast((m) => m.role === "assistant" && m.model)?.model;
        if (lastModel) setComposerModel(lastModel);
        setMemoryOn(chat.memory_enabled);
        setLoadedProjectId(chat.project_id);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof NotFoundError) {
          setMissing(true);
          return;
        }
        showError(error instanceof Error ? error.message : "Failed to load messages");
        setMessages([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chatId, showError, setComposerModel]);

  React.useEffect(() => {
    if (loading || !pendingRef.current) return;
    const p = pendingRef.current;
    pendingRef.current = null;
    if (p.webSearch) composer.setWebSearch(true);
    composer.setModel(p.model);
    send(p.content, p.model, p.images ?? [], p.files ?? [], !!p.webSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, send]);

  const refreshGate = React.useCallback(async () => {
    try {
      setGate(await getCompressionGate(chatId, visibleMessages(messagesRef.current, selectionRef.current), model));
    } catch {
      setGate({ required: false, quota: null });
    }
  }, [chatId, model]);

  React.useEffect(() => {
    if (!loading && !streaming) void refreshGate();
  }, [loading, streaming, messages.length, refreshGate]);

  const retry = (messageId: string) => {
    if (streaming || getChatStream(chatId)?.phase === "streaming") return;
    const target = messagesRef.current.find((m) => m.id === messageId);
    if (!target || target.role !== "assistant") return;
    const shown = visibleMessages(messagesRef.current, selectionRef.current);
    const last = shown.findLast((m) => m.role === "assistant");
    if (!last || (last.id !== target.id && (!target.variant_group || last.variant_group !== target.variant_group))) return;
    const idx = shown.findIndex((m) => m.id === messageId || (!!target.variant_group && m.variant_group === target.variant_group));
    const history = idx >= 0 ? shown.slice(0, idx) : shown;
    if (!startRetryStream({ chatId, assistantId: target.id, variantGroup: target.variant_group, model, history })) return;
    setStream({ content: "", activity: null });
    setMessages((prev) =>
      target.variant_group ? prev.filter((m) => m.variant_group !== target.variant_group) : prev.filter((m) => m.id !== messageId),
    );
  };

  const [savedSkills, setSavedSkills] = React.useState<Skill[]>([]);
  const [savingSkill, setSavingSkill] = React.useState<string | null>(null);
  const [savedHere, setSavedHere] = React.useState<ReadonlyMap<string, string>>(new Map());
  const [savingArtifact, setSavingArtifact] = React.useState<string | null>(null);
  const libraryPaths = project?.library.paths;
  const { data, artifacts } = React.useMemo(
    () =>
      toViewData(
        visibleMessages(messages, selection),
        stream,
        { saved: savedSkills, saving: savingSkill },
        libraryPaths ? { paths: libraryPaths, savedHere, saving: savingArtifact } : undefined,
      ),
    [messages, selection, stream, savedSkills, savingSkill, libraryPaths, savedHere, savingArtifact],
  );

  // Saved skills are only needed to label drafted ones, so a chat without drafts never loads them.
  const hasSkillDrafts = data.some((m) => m.role === "assistant" && !!m.skills?.length);
  React.useEffect(() => {
    if (!hasSkillDrafts) return;
    const load = () => listSkills().then(setSavedSkills).catch(() => {});
    load();
    window.addEventListener(SKILLS_UPDATED_EVENT, load);
    return () => window.removeEventListener(SKILLS_UPDATED_EVENT, load);
  }, [hasSkillDrafts]);

  const saveSkill = async (draft: SkillDraftData) => {
    const fields = { name: draft.name.trim(), description: draft.description.trim(), content: draft.content.trim() };
    if (!skillFits(fields)) return showError("This skill is too long to save. Ask Karui to shorten it.");
    const { existing } = draftStatus(fields, savedSkills);
    const limit = SKILL_COUNT_LIMIT[getUser()?.tier === "pro" ? "pro" : "free"];
    if (!existing && savedSkills.length >= limit) return showError(`You can keep up to ${limit} skills. Delete one in Settings to save this one.`);
    setSavingSkill(draft.id);
    try {
      const saved = await (existing ? updateSkill(existing.id, fields, existing.updatedAt) : createSkill(fields));
      setSavedSkills((all) => [...all.filter((s) => s.id !== saved.id), saved]);
      showSuccess(existing ? "Skill updated" : "Skill saved");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to save skill");
    } finally {
      setSavingSkill(null);
    }
  };

  const current = openArtifact ? artifacts.get(openArtifact) : undefined;

  // A note or document in the Library opens there, at its latest version; one that isn't opens from the message.
  const openArtifactData = (a: ArtifactData) => {
    if (!a.library?.saved) return setOpenArtifact(a.id);
    setOpenArtifact(null);
    project?.library.open(a.library.path);
  };

  const saveToLibrary = async (a: ArtifactData) => {
    const art = artifacts.get(a.id);
    const routeProjectId = project?.routeProjectId;
    if (!art || !routeProjectId) return;
    setSavingArtifact(a.id);
    try {
      const path = await saveArtifactToLibrary(routeProjectId, art);
      setSavedHere((saved) => new Map(saved).set(a.id, path));
      showSuccess("Saved to the Library");
    } catch (error) {
      showError(error instanceof Error && error.message ? error.message : "Couldn't save to the Library");
    } finally {
      setSavingArtifact(null);
    }
  };

  const enclave = enclaveFor(model, streaming);

  const self = library.chats.find((c) => c.id === chatId) ?? { id: chatId, title: title || "New chat", starred: false };
  const libraryEntry = library.raw.chats.find((c) => c.id === chatId);
  const projectId = libraryEntry ? libraryEntry.project_id : loadedProjectId;
  const projectName = library.raw.projects.find((p) => p.id === projectId)?.name ?? null;

  // Redirect moved project chats to their current workspace only after streaming ends.
  const routeProjectId = project?.routeProjectId ?? null;
  React.useEffect(() => {
    if (loading || missing || streaming) return;
    const actual = projectId ?? null;
    if (actual !== routeProjectId) router.replace(actual ? `/projects/${actual}/${chatId}` : `/chat/${chatId}`);
  }, [loading, missing, streaming, projectId, routeProjectId, chatId, router]);

  const onDocumentOpen = project?.onDocumentOpen;
  const documentOpen = !!current;
  React.useEffect(() => {
    onDocumentOpen?.(documentOpen);
  }, [onDocumentOpen, documentOpen]);
  React.useEffect(() => () => onDocumentOpen?.(false), [onDocumentOpen]);

  const toggleMemory = () => {
    const next = !memoryOn;
    setMemoryOn(next);
    memorySave.current = setChatMemory(chatId, next).then(
      () => {},
      () => {
        setMemoryOn(!next);
        showError("Couldn't change memory for this chat");
      },
    );
  };
  const blocked = gate.quota !== null && !gate.quota.available;

  const [dismissedQuestions, setDismissedQuestions] = React.useState<string | null>(null);
  const asking = loading ? null : pendingQuestions(data, dismissedQuestions);
  const answerQuestions = (id: string, answer: string) => {
    if (send(answer, model, [], [], composer.webSearch)) setDismissedQuestions(id);
  };

  if (missing) notFound();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...composer.drop.dropHandlers}>
      <DropOverlay active={composer.drop.isDragging} note={composer.props.attachNote} />
      <ChatView
        loading={loading}
        title={title || "New chat"}
        starred={self.starred}
        enclave={enclave}
        messages={loading ? [] : data}
        composer={{
          ...composer.props,
          sending: streaming || loading,
          onStop: streaming ? () => stopChatStream(chatId) : undefined,
          // Project chats have no user memory.
          memory: composer.memoryAvailable && !projectId ? { on: memoryOn, onToggle: toggleMemory } : undefined,
          project: { name: projectName, onPick: () => library.actions?.onMoveChat(self) },
          quote,
          onClearQuote: () => {
            setQuote(null);
            clearQuoted();
          },
        }}
        gate={
          gate.required
            ? {
                blockedUntil: blocked ? (resetTime(gate.quota?.resetAt) ?? "the next reset") : null,
                compressing,
                onCompress: async () => {
                  setCompressing(true);
                  try {
                    const outcome = await compressChatNow(chatId, model, visibleMessages(messagesRef.current, selectionRef.current));
                    if (outcome !== "done") showError(COMPRESSION_FAILED[outcome]);
                  } catch {
                    showError("Couldn't condense this conversation. Please try again in a moment.");
                  } finally {
                    await refreshGate();
                    setCompressing(false);
                  }
                },
              }
            : null
        }
        chatActions={{
          onStar: () => library.actions?.onStarChat(self),
          onRename: (t) => library.actions?.onRenameChat(self, t),
          onMove: () => library.actions?.onMoveChat(self),
          onDelete: () => library.actions?.onDeleteChat(self),
        }}
        onQuote={(text) => {
          const sel = window.getSelection();
          clearQuoted();
          if (sel?.rangeCount) markQuoted(sel.getRangeAt(0));
          setQuote(text);
        }}
        onRetry={streaming ? undefined : retry}
        onVariant={(id, dir) => {
          const group = messages.find((m) => m.id === id)?.variant_group;
          if (!group) return;
          const total = messages.filter((m) => m.variant_group === group).length;
          setSelection((prev) => ({ ...prev, [group]: Math.min(total - 1, Math.max(0, (prev[group] ?? total - 1) + dir)) }));
          void invalidateSummaryForMessage(chatId, id)
            .catch(() => {})
            .then(refreshGate);
        }}
        project={project && { ...project.header, onTogglePanel: current ? () => setOpenArtifact(null) : project.header.onTogglePanel }}
        focusMessageId={focus?.messageId}
        onFocusShown={onFocusShown}
        onOpenArtifact={openArtifactData}
        onDownloadArtifact={(a) => {
          const art = artifacts.get(a.id);
          if (art) downloadArtifact(art);
        }}
        onSaveArtifact={project ? (a) => void saveToLibrary(a) : undefined}
        onSaveSkill={(d) => void saveSkill(d)}
        questions={
          asking && {
            ...asking,
            onAnswer: (answer) => answerQuestions(asking.id, answer),
            onSkip: () => setDismissedQuestions(asking.id),
          }
        }
        artifactPanel={artifactPanelOf(openArtifact, current, () => setOpenArtifact(null))}
      />
    </div>
  );
}
