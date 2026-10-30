import { useEffect, useRef, type ComponentProps } from "react";
import { type Message } from "@/lib/chat/chat";
import { limitOf, statusOf } from "@/lib/core/errors";
import { isProviderVerified } from "@/lib/chat/inference";
import { getModelProvider, PROVIDERS } from "@/lib/models/providers";
import type { EnclaveState } from "@/components/app/chat/ChatView";
import { parseMessageContent, type ChatImage, type ChatTextFile } from "@/lib/messages/vision";
import { downloadArtifactDoc, downloadArtifactHtml, downloadArtifactMarkdown, parseArtifacts, type Artifact } from "@/lib/artifacts/artifacts";
import { chatFiles } from "@/lib/artifacts/chatFiles";
import type { ArtifactPanel, ArtifactVersion } from "@/components/app/chat/ArtifactPanel";
import { modelLabel, parseMessageBlocks, splitQuote, STOPPED_NOTICE } from "@/lib/messages/messageBlocks";
import { draftStatus, parseSkillDrafts, type Skill, type SkillDraft } from "@/lib/chat/skills";
import { parseQuestions } from "@/lib/messages/questions";
import type { AnswerActivity } from "@/lib/chat/answerTools";
import type { ArtifactChange, ArtifactData, MessageData, SkillDraftData } from "@/components/app/chat/Messages";
import type { QuestionData } from "@/components/app/chat/Questions";


export function resetTime(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function errorText(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : fallback;
  const limit = limitOf(error);
  const at = resetTime(limit.resetAt);
  const reset = at ? ` It resets at ${at}.` : "";
  if (limit.code === "free_token_limit") return `You've used today's free allowance.${reset}`;
  if (limit.code === "pro_token_limit") return `You've reached the Pro limit for now.${reset}`;
  const status = statusOf(error);
  if (status === 400) return "That request didn't go through. Please try again.";
  if (status === 401 || msg.includes("unauthorized")) return "Your session has expired. Please sign in again.";
  return msg;
}

/** `savedHere`: saves made by hand on this page, which a message's tag can't record (messages aren't rewritten). */
export type ChatLibrary = { paths: ReadonlySet<string>; savedHere: ReadonlyMap<string, string>; saving: string | null };

function changeOf(artifact: Artifact): ArtifactChange | undefined {
  if (artifact.saved === "updated") return { kind: "updated" };
  if (artifact.saved === "edited") return { kind: "edited", count: artifact.changes ?? 1 };
  // A failed save of a new file has no reason: its card offers Save to Library instead.
  if (artifact.saved === "failed" && artifact.reason) return { kind: "failed", reason: artifact.reason };
  return undefined;
}

function libraryOf(key: string, artifact: Artifact, library: ChatLibrary): ArtifactData["library"] {
  const tagged = artifact.saved && artifact.saved !== "failed" ? artifact.path : undefined;
  const path = library.savedHere.get(key) ?? tagged ?? (artifact.edit ? artifact.path : undefined);
  const change = changeOf(artifact);
  return { path: path ?? "", saved: path !== undefined && library.paths.has(path), saving: library.saving === key, change };
}

/**
 * Outside a project, the chat's file a card shows: its path, which version the card is, every version Karui wrote and the
 * card holding the latest one.
 */
type ChatFileView = { path: string; version: number; history: ArtifactVersion[]; latestCard: string };

/** An artifact as a card shows it; `file` only in chats outside a project. */
export type ShownArtifact = Artifact & { file?: ChatFileView };

// Keyed like the cards: message id and the block's place in it.
function chatFileViews(messages: ShownMessage[]): Map<string, ChatFileView> {
  const views = new Map<string, ChatFileView>();
  for (const file of chatFiles(messages).values()) {
    const history = file.versions.map((v, i) => ({ number: i + 1, content: v.content, savedAt: messages[v.turn].created_at }));
    const cardOf = (v: (typeof file.versions)[number]) => `${messages[v.turn].id}:${v.block}`;
    const latestCard = cardOf(file.versions[file.versions.length - 1]);
    file.versions.forEach((v, i) => views.set(cardOf(v), { path: file.path, version: i + 1, history, latestCard }));
  }
  return views;
}

function chatOf(artifact: ShownArtifact): ArtifactData["chat"] {
  if (artifact.reason) return { change: { kind: "failed", reason: artifact.reason } };
  if (!artifact.file) return undefined;
  return { version: artifact.file.version, change: artifact.changes ? { kind: "edited", count: artifact.changes } : undefined };
}

function artifactsOf(id: string, artifacts: ShownArtifact[], library?: ChatLibrary): ArtifactData[] {
  return artifacts.map((a, i) => {
    const key = `${id}:${i}`;
    return {
      id: key,
      title: a.title,
      type: a.type,
      edit: a.edit,
      streaming: a.streaming,
      library: library && libraryOf(key, a, library),
      chat: library ? undefined : chatOf(a),
    };
  });
}

function panelDataOf(id: string, current: ShownArtifact, versionsBack: number): ComponentProps<typeof ArtifactPanel>["artifact"] {
  const { title, type, streaming, file } = current;
  if (!file) return { id, title, type, source: current.content, streaming };
  const history = file.history.slice(-(versionsBack + 1));
  const latest = history[history.length - 1];
  // A new version from Karui starts the panel's own edits afresh.
  return { id: `chat:${file.path}:${latest.number}`, title, type, source: latest.content, history, openAt: file.version };
}

/** While a chat's file is open, a new version Karui writes of it opens in its place; an older card opened by hand stays. */
export function useFollowNewVersions(current: ShownArtifact | undefined, open: (id: string) => void): void {
  const seen = useRef<{ path: string; latestCard: string } | null>(null);
  const path = current?.file?.path;
  const latestCard = current?.file?.latestCard;
  useEffect(() => {
    if (!path || !latestCard) {
      seen.current = null;
      return;
    }
    const before = seen.current;
    seen.current = { path, latestCard };
    if (before?.path === path && before.latestCard !== latestCard) open(latestCard);
  }, [path, latestCard, open]);
}

/** `versionsBack` limits the versions of a chat's file the panel lists besides the latest. */
export function artifactPanelOf(
  id: string | null,
  current: ShownArtifact | undefined,
  onClose: () => void,
  versionsBack = Infinity,
): ComponentProps<typeof ArtifactPanel> {
  const download = (save: (artifact: Artifact) => void) => (source: string) => {
    if (current) save({ ...current, content: source });
  };
  return {
    artifact: id && current ? panelDataOf(id, current, versionsBack) : null,
    onClose,
    onDownloadHtml: download(downloadArtifactHtml),
    onDownloadDoc: download(downloadArtifactDoc),
    onDownloadMarkdown: download(downloadArtifactMarkdown),
  };
}

export function toUser(m: Message): MessageData {
  const parsed = parseMessageContent(m.content);
  const { quote, text } = splitQuote(parsed.text);
  return {
    id: m.id,
    role: "user",
    text,
    quote,
    images: parsed.images.map((img: ChatImage) => ({ src: img.data, name: img.name })),
    files: parsed.files.map((f: ChatTextFile) => ({ name: f.name, meta: `${Math.max(1, Math.round(f.content.length / 1024))} KB` })),
    decryptionFailed: m.decryptionFailed,
  };
}

type AssistantData = Extract<MessageData, { role: "assistant" }>;

// What the chat knows about the user's saved skills, to label each drafted skill as new, an update or already saved.
type SkillContext = { saved: Skill[]; saving: string | null };
const NO_SKILLS: SkillContext = { saved: [], saving: null };

function skillsOf(id: string, drafts: SkillDraft[], skills: SkillContext): SkillDraftData[] {
  return drafts.map((d, i) => {
    const key = `${id}:skill:${i}`;
    return { ...d, id: key, name: d.name || "New skill", status: draftStatus(d, skills.saved).status, saving: skills.saving === key };
  });
}

function visibleReplyText(text: string): string {
  return parseQuestions(parseSkillDrafts(text).text).text;
}

export function toAssistant(
  id: string,
  content: string,
  extra: Partial<AssistantData>,
  skills: SkillContext = NO_SKILLS,
  library?: ChatLibrary,
  files?: ReadonlyMap<string, ChatFileView>,
): { message: AssistantData; artifacts: ShownArtifact[] } {
  const { artifacts: parsed, text } = parseArtifacts(content);
  const artifacts = parsed.map((a, i) => ({ ...a, file: files?.get(`${id}:${i}`) }));
  const stopped = text.includes(STOPPED_NOTICE);
  const { steps, answer, preparation, timeline } = parseMessageBlocks(text.replaceAll(STOPPED_NOTICE, ""));
  const { drafts, text: withoutDrafts } = parseSkillDrafts(answer);
  const { questions, text: shown } = parseQuestions(withoutDrafts);
  const last = timeline?.at(-1);
  const chronological = timeline?.slice(0, last?.kind === "message" ? -1 : undefined).map((segment) => segment.kind === "message"
    ? { ...segment, text: visibleReplyText(segment.text) }
    : segment);
  const finalText = timeline ? (last?.kind === "message" ? visibleReplyText(last.text) : "") : shown;
  const prose = timeline?.filter((segment) => segment.kind === "message").map((segment) => visibleReplyText(segment.text)).join("\n\n") ?? shown;
  const thoughts = steps.filter((step) => step.kind === "thought").map((step) => step.text).join("\n\n");
  return {
    message: {
      id,
      role: "assistant" as const,
      text: finalText,
      copyText: prose || thoughts,
      stopped,
      steps,
      preparation: chronological ?? preparation,
      artifacts: artifactsOf(id, artifacts, library),
      skills: skillsOf(id, drafts, skills),
      questions,
      ...extra,
    },
    artifacts,
  };
}

export type Streaming = { content: string; activity: AnswerActivity | null; thinkingSince?: number | null; phase?: "streaming" | "saving" | "error"; error?: string } | null;

// The thinking counter advances as reasoning tokens re-render the stream.
function streamStatus(stream: NonNullable<Streaming>): string | null {
  if (stream.phase === "saving") return "Saving reply";
  if (stream.activity) return activityStatus(stream.activity);
  if (stream.thinkingSince == null) return null;
  return `Thinking · ${Math.floor((Date.now() - stream.thinkingSince) / 1000)}s`;
}

function activityStatus(activity: AnswerActivity): string {
  if (activity.kind === "search") return "Searching the web";
  try {
    return `Reading ${new URL(activity.url).hostname.replace(/^www\./, "")}`;
  } catch {
    return "Reading a page";
  }
}

type ShownMessage = Message & { variant?: { index: number; total: number } };

export function toViewData(
  messages: ShownMessage[],
  stream: Streaming,
  skills: SkillContext = NO_SKILLS,
  library?: ChatLibrary,
): { data: MessageData[]; artifacts: Map<string, ShownArtifact> } {
  const byId = new Map<string, ShownArtifact>();
  const files = library ? undefined : chatFileViews(messages);
  const data: MessageData[] = messages.map((m) => {
    if (m.role === "user") return toUser(m);
    const { message, artifacts } = toAssistant(m.id, m.content, {
      model: modelLabel(m.model, m.provider),
      variant: m.variant,
      decryptionFailed: m.decryptionFailed,
    }, skills, library, files);
    artifacts.forEach((a, i) => byId.set(`${m.id}:${i}`, a));
    return message;
  });
  if (stream) {
    // No Library state while streaming: the note is saved only after the answer ends.
    const { message, artifacts } = toAssistant("streaming", stream.content, {
      streaming: stream.phase !== "error",
      status: streamStatus(stream),
      error: stream.error,
      retryLabel: stream.error ? "Retry save" : undefined,
    }, skills);
    artifacts.forEach((a, i) => byId.set(`streaming:${i}`, a));
    data.push(message);
  }
  return { data, artifacts: byId };
}

/** The questions Karui is waiting on: those of the latest message, once it has finished and unless the user skipped them. */
export function pendingQuestions(data: MessageData[], skipped: string | null): { id: string; questions: QuestionData[] } | null {
  const last = data[data.length - 1];
  if (last?.role !== "assistant" || last.streaming || last.error || !last.questions?.length || last.id === skipped) return null;
  return { id: last.id, questions: last.questions };
}

export function enclaveFor(model: string, streaming: boolean): EnclaveState | undefined {
  const provider = getModelProvider(model);
  if (!provider) return undefined;
  return {
    provider: PROVIDERS[provider].name,
    state: isProviderVerified(provider) ? "verified" : streaming ? "verifying" : "unverified",
  };
}
