/**
 * Chat API client. Content is encrypted in the browser; the server stores and returns ciphertext only.
 * The AES key never reaches the server.
 */

import { ensureAesKey, getUser } from "@/lib/account/session";
import { decryptField, encryptField, fieldAad, messageAad } from "@/lib/account/crypto";
import { getProject, listProjectFiles, listProjectMemory, readProjectFiles } from "@/lib/projects/projects";
import { saveArtifactsToLibrary } from "@/lib/projects/projectFiles";
import {
  applyLiveMemoryEdit,
  applyProjectMemoryEdit,
  getMemoryFilesForChat,
  getMemorySettings,
  getYouFilesForProject,
  type LiveMemoryEdit,
  type MemoryFileForChat,
} from "./memory";
import { stripMemoryWriteBlocks } from "@/lib/messages/memoryWrite";
import { isUnverifiedAnswer, lastToolCallFailure, parseMessageBlocks, STOPPED_NOTICE, unverifiedAnswerContext } from "@/lib/messages/messageBlocks";
import { getCustomInstructionsContext } from "./customInstructions";
import { getSkillsForChat } from "./skills";
import { BRIEF_CLOSE, BRIEF_OPEN, TITLE_CLOSE, TITLE_OPEN, createTagFilter, stripTitleBlock, stripToolCalls } from "@/lib/messages/streamTags";
import { resolveReasoningEffort } from "@/lib/models/reasoning";
import { streamE2EChat, contextBudgetFor, ensureModelAvailable, type E2EStreamOptions } from "./inference";
import { type AnswerActivity } from "./answerTools";
import { getModelProvider, type ProviderId } from "@/lib/models/providers";
import {
  maybeCompressChat,
  clearChatSummary,
  compressionRequired,
  getCompressionQuota,
  type CompressionOutcome,
  type CompressionQuota,
} from "./compression";
import { afterSummary, type ChatTurn, type HistoryMessage } from "@/lib/messages/conversation";
import { RateLimitError } from "@/lib/core/errors";
import {
  type ChatImage,
  type ChatTextFile,
  packMessageContent,
  turnContentForAI,
  modelSupportsImages,
  IMAGES_UNSUPPORTED_NOTE,
} from "@/lib/messages/vision";
import { API_URL, JSON_HEADERS, apiFetch } from "@/lib/core/api";

function requireProvider(modelId: string): ProviderId {
  const provider = getModelProvider(modelId);
  if (!provider) throw new Error(`Model "${modelId}" is not available from any provider`);
  return provider;
}

async function requireAesKey(): Promise<CryptoKey> {
  const key = await ensureAesKey();
  if (!key) throw new Error("Encryption key unavailable — please sign in again.");
  return key;
}

export interface Chat {
  id: string;
  title: string;
  starred: boolean;

  memory_enabled: boolean;
  project_id?: string;

  brief?: string;
  // Decrypted summary of older turns. Only getChat fills it; the chat list does not fetch it.
  summary?: string;
  summary_up_to_message_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateChatResponse {
  id: string;
  title: string;
  created_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  provider?: string;
  variant_group?: string;
  pinned: boolean;
  // Tokens: user turns count the whole prompt context, assistant turns the generated answer. Estimated.
  tokens: number;
  created_at: string;
  /**
   * The content couldn't be decrypted (wrong key, corrupted ciphertext).
   * `content` then carries a label for a human rather than what the user wrote —
   * such a turn must not be sent to the model.
   */
  decryptionFailed?: boolean;
}

// Shown in place of undecryptable content. A label for humans, not conversation: turnsForAI filters on it before the model sees the history.
export const UNDECRYPTABLE_PLACEHOLDER = "(unable to decrypt)";

// <notice> blocks are UI metadata. Strip them from history, or the model reacts to them (e.g. apologising for 'memory skipped').
// Search and page steps go too: the model copied them and wrote made-up results instead of searching.
export function stripNoticeBlocks(content: string): string {
  return content
    .replace(/<notice>[\s\S]*?<\/notice>/g, "")
    .replace(/<search>[\s\S]*?<\/search>/g, "")
    .replace(/<fetched_page>[\s\S]*?<\/fetched_page>/g, "")
    .replace(/<tool>[\s\S]*?<\/tool>/g, "")
    .replace(/<library>[\s\S]*?<\/library>/g, "")
    .replace(/<skills_used>[\s\S]*?<\/skills_used>/g, "")
    .replace(/<memory_read>[\s\S]*?<\/memory_read>/g, "")
    .replace(/<helper_message>[\s\S]*?(?:<\/helper_message>|$)/g, "");
}

// Strip UI-only and helper-phase blocks from history. <memory_write> makes the model repeat saved notes; <reasoning> leaks into visible replies. Every path that sends history must go through this function.
export function stripHiddenBlocks(content: string, role: ChatTurn["role"] = "assistant"): string {
  const stripped = stripReasoningBlocks(stripMemoryWriteBlocks(stripNoticeBlocks(content)));
  return role === "assistant" ? stripToolCalls(stripped) : stripped;
}

function stripReasoningBlocks(content: string): string {
  return content.replace(/<reasoning>([\s\S]*?)(?:<\/reasoning>|$)/g, (_, inner: string) => {
    const leak = inner.indexOf("</think>");
    return leak === -1 ? "" : inner.slice(leak + "</think>".length);
  });
}

function requireAnswer(content: string): void {
  const parsed = parseMessageBlocks(content);
  if (parsed.answer.trim() || (content.includes(STOPPED_NOTICE) && parsed.steps.some((step) => step.kind !== "notice"))) return;
  throw new Error(lastToolCallFailure(content) ?? "The model returned an empty response");
}

function canBeSummarised(turn: ChatTurn): boolean {
  return turn.content.trim() !== UNDECRYPTABLE_PLACEHOLDER && !(turn.role === "assistant" && isUnverifiedAnswer(turn.content));
}

// A stopped answer stays a quote, never a verified assistant turn.
function turnsForAI(turns: ChatTurn[], readsImages: boolean) {
  return turns
    .filter((turn) => turn.content.trim() !== UNDECRYPTABLE_PLACEHOLDER)
    .map((turn) => {
      const { content, images } = turnContentForAI(stripHiddenBlocks(turn.content, turn.role), readsImages);
      return {
        role: turn.role,
        content: turn.role === "assistant" && isUnverifiedAnswer(turn.content) ? unverifiedAnswerContext(content) : content,
        ...(images && images.length > 0 ? { images } : {}),
      };
    });
}

// Unverified answers stay out of summaries and memory. Images count as their description; counting base64 would trip the compression gate.
function modelTurns(messages: HistoryMessage[]): { turns: ChatTurn[]; ids: string[] } {
  const kept = messages.filter((m) => !m.decryptionFailed && canBeSummarised(m));
  return {
    turns: kept.map((m) => ({ role: m.role, content: turnContentForAI(stripHiddenBlocks(m.content, m.role), false).content })),
    ids: kept.map((m) => m.id),
  };
}

// History after the summary boundary. A summary whose boundary is missing describes a conversation no longer on screen, so it is dropped rather than sent.
async function sinceSummary(
  key: CryptoKey,
  chatId: string,
  chat: Chat | null,
  history: HistoryMessage[]
): Promise<{ history: HistoryMessage[]; summary: string }> {
  const cut = afterSummary(history, chat?.summary ? chat.summary_up_to_message_id : undefined);
  if (!cut.valid) await clearChatSummary(key, chatId).catch(() => {});
  return { history: cut.messages, summary: cut.valid ? (chat?.summary ?? "") : "" };
}

interface RawChat {
  id: string;
  encrypted_title: string;
  encrypted_brief?: string;
  encrypted_summary?: string;
  summary_up_to_message_id?: string;
  starred: boolean;
  memory_enabled: boolean;
  project_id?: string;
  created_at: string;
  updated_at: string;
}

interface RawMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  encrypted_content: string;
  model?: string;
  provider?: string;
  variant_group?: string;
  pinned: boolean;
  tokens?: number;
  created_at: string;
}

interface ApiError {
  error: string;
  code?: string;
  reset_at?: string;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export { RateLimitError };

async function apiCall<T>(endpoint: string, options: RequestInit): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  try {
    const response = await apiFetch(url, {
      ...options,
      headers: { ...JSON_HEADERS, ...options.headers },
    });

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        error: `HTTP error ${response.status} ${response.statusText}`,
      }));
      const message = errorData.error || `HTTP error ${response.status}`;
      if (errorData.reset_at || errorData.code) throw new RateLimitError(message, errorData.reset_at, errorData.code);
      throw response.status === 404 ? new NotFoundError(message) : new Error(message);
    }

    if (response.status === 204) {
      return null as unknown as T;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Cannot reach the server. Please try again in a moment.");
  }
}

async function decryptChat(key: CryptoKey, raw: RawChat): Promise<Chat> {
  let title = "";
  try {
    title = await decryptField(key, raw.encrypted_title, fieldAad("chat-title", raw.id));
  } catch {
    title = "(unable to decrypt)";
  }
  // The summary is decrypted silently and dropped on failure: it is an improvement, not conversation content, and a placeholder would reach the model as its memory. It is bound to its boundary, so a moved boundary makes it fail.
  let summary = "";
  if (raw.encrypted_summary) {
    try {
      summary = await decryptField(
        key,
        raw.encrypted_summary,
        fieldAad("chat-summary", raw.id, raw.summary_up_to_message_id ?? "")
      );
    } catch {
      summary = "";
    }
  }

  // A summary WITHOUT a boundary is stale and must not be given to the model.
  // The database nulls summary_up_to_message_id when its message is deleted (ON DELETE SET NULL). Such a summary must not reach the model.
  const summaryValid = Boolean(summary) && Boolean(raw.summary_up_to_message_id);
  const brief = raw.encrypted_brief
    ? await decryptField(key, raw.encrypted_brief, fieldAad("chat-brief", raw.id)).catch(() => "")
    : "";

  return {
    id: raw.id,
    title,
    brief: brief || undefined,
    starred: raw.starred,
    memory_enabled: raw.memory_enabled,
    project_id: raw.project_id,
    summary: summaryValid ? summary : undefined,
    summary_up_to_message_id: raw.summary_up_to_message_id,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

async function decryptMessageRow(key: CryptoKey, raw: RawMessage): Promise<Message> {
  let content = "";
  let decryptionFailed = false;
  try {
    content = await decryptField(key, raw.encrypted_content, messageAad(raw.chat_id, raw.id, raw.role));
  } catch {
    content = UNDECRYPTABLE_PLACEHOLDER;
    decryptionFailed = true;
  }
  return {
    ...(decryptionFailed ? { decryptionFailed } : {}),
    id: raw.id,
    chat_id: raw.chat_id,
    role: raw.role,
    content,
    model: raw.model,
    provider: raw.provider,
    variant_group: raw.variant_group,
    pinned: raw.pinned,
    tokens: raw.tokens ?? 0,
    created_at: raw.created_at,
  };
}

export async function getChats(): Promise<Chat[]> {
  const key = await requireAesKey();
  const raw = await apiCall<RawChat[]>("/api/chats", { method: "GET" });
  return Promise.all(raw.map((c) => decryptChat(key, c)));
}

export async function getChat(id: string): Promise<Chat> {
  const key = await requireAesKey();
  const raw = await apiCall<RawChat>(`/api/chats/${id}`, { method: "GET" });
  return decryptChat(key, raw);
}

export async function createChat(title?: string, memoryEnabled = true): Promise<CreateChatResponse> {
  const key = await requireAesKey();
  const plain = (title && title.trim()) || "New chat";
  // The id comes from here, not the server: the title is bound to it.
  const id = crypto.randomUUID();
  const encrypted_title = await encryptField(key, plain, fieldAad("chat-title", id));
  const raw = await apiCall<RawChat>("/api/chats", {
    method: "POST",
    body: JSON.stringify({ id, encrypted_title, memory_enabled: memoryEnabled }),
  });
  return { id: raw.id, title: plain, created_at: raw.created_at };
}

// Checked before createChat, so a model an admin turned off doesn't leave an empty chat behind.
export async function ensureChatModelAvailable(model: ModelType): Promise<void> {
  await ensureModelAvailable(model, requireProvider(model));
}

export async function starChat(id: string): Promise<{ starred: boolean }> {
  return apiCall<{ starred: boolean }>(`/api/chats/${id}/star`, { method: "PATCH" });
}

export async function setChatMemory(id: string, enabled: boolean): Promise<{ memory_enabled: boolean }> {
  return apiCall<{ memory_enabled: boolean }>(`/api/chats/${id}/memory`, {
    method: "PATCH",
    body: JSON.stringify({ memory_enabled: enabled }),
  });
}

export async function renameChat(id: string, title: string): Promise<Chat> {
  const key = await requireAesKey();
  const encrypted_title = await encryptField(key, title, fieldAad("chat-title", id));
  const raw = await apiCall<RawChat>(`/api/chats/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ encrypted_title }),
  });
  return decryptChat(key, raw);
}

export async function setChatBrief(id: string, brief: string): Promise<void> {
  const key = await requireAesKey();
  const encrypted_brief = brief ? await encryptField(key, brief, fieldAad("chat-brief", id)) : "";
  await apiCall<void>(`/api/chats/${id}/brief`, { method: "PATCH", body: JSON.stringify({ encrypted_brief }) });
}

export async function deleteChat(id: string): Promise<void> {
  await apiCall<void>(`/api/chats/${id}`, { method: "DELETE" });
}

export async function getMessages(chatId: string): Promise<Message[]> {
  const key = await requireAesKey();
  const raw = await apiCall<RawMessage[]>(`/api/chats/${chatId}/messages`, { method: "GET" });
  return Promise.all(raw.map((m) => decryptMessageRow(key, m)));
}

export async function readChatMessages(chatIds: string[]): Promise<Map<string, Message[]>> {
  const key = await requireAesKey();
  const out = new Map<string, Message[]>();
  let pending = chatIds;
  while (pending.length) {
    const res = await apiCall<{ chats: { chat_id: string; messages: RawMessage[] }[]; skipped: string[] }>("/api/chats/messages/read", {
      method: "POST",
      body: JSON.stringify({ chat_ids: pending }),
    });
    for (const c of res.chats) out.set(c.chat_id, await Promise.all(c.messages.map((m) => decryptMessageRow(key, m))));
    if (!res.chats.length) break;
    pending = res.skipped;
  }
  return out;
}

// Message positions without decrypting content, so long chats skip AES-GCM work. A retry variant takes its group's position.
async function getMessagePositions(chatId: string): Promise<Map<string, number>> {
  const raw = await apiCall<RawMessage[]>(`/api/chats/${chatId}/messages`, { method: "GET" });
  const groupStart = new Map<string, number>();
  const positions = new Map<string, number>();
  raw.forEach((m, i) => {
    if (m.variant_group && !groupStart.has(m.variant_group)) groupStart.set(m.variant_group, i);
    positions.set(m.id, m.variant_group ? groupStart.get(m.variant_group)! : i);
  });
  return positions;
}

// Logical model IDs. A model missing here gets a 400 on send. 'kimi-k2.6' stays for the model column of old messages.
export type ModelType =
  | "fast"
  | "smart"
  | "glm-5-3-flash"
  | "gpt-oss-120b"
  | "kimi-k2.6"
  | "gemma4-31b";

interface AppendMessageInput {
  role: "user" | "assistant";
  content: string;
  model?: string;
  provider?: string;
  variant_group?: string;
  tokens?: number;
}

export class MessageSaveError extends Error {
  constructor(readonly messages: Message[], readonly retry: () => Promise<Message[]>, cause: unknown) {
    super("Couldn't save this reply. Copy it before reloading, or retry saving.", { cause });
    this.name = "MessageSaveError";
  }
}

async function appendMessages(
  chatId: string,
  key: CryptoKey,
  inputs: AppendMessageInput[],
  discard: string[] = []
): Promise<Message[]> {
  const messages = await Promise.all(
    inputs.map(async (m) => {
      const id = crypto.randomUUID();
      return {
        id,
        role: m.role,
        encrypted_content: await encryptField(key, m.content, messageAad(chatId, id, m.role)),
        model: m.model,
        provider: m.provider,
        variant_group: m.variant_group,
        tokens: m.tokens,
      };
    })
  );
  const persist = async (): Promise<Message[]> => {
    const raw = await apiCall<RawMessage[]>(`/api/chats/${chatId}/messages/batch`, {
      method: "POST",
      body: JSON.stringify({ messages, ...(discard.length > 0 ? { discard } : {}) }),
    });
    return Promise.all(raw.map((r) => decryptMessageRow(key, r)));
  };
  const pending: Message[] = inputs.map((input, i) => ({
    ...input, id: messages[i].id, chat_id: chatId, pinned: false,
    tokens: input.tokens ?? 0, created_at: new Date().toISOString(),
  }));
  const retry = async (): Promise<Message[]> => {
    // A lost HTTP response does not mean the transaction failed. Reconcile before reusing its IDs.
    const existing = await getMessages(chatId);
    const committed = pending.map((message) => existing.find((row) => row.id === message.id && row.role === message.role && row.content === message.content));
    if (committed.every((message) => message !== undefined)) return committed as Message[];
    return persist();
  };
  try {
    return await persist();
  } catch (error) {
    throw new MessageSaveError(pending, retry, error);
  }
}

interface ProjectTurn {

  context: string;
  memoryFiles: MemoryFileForChat[];
  memoryWrites: boolean;
  applyMemoryEdit: (edit: LiveMemoryEdit) => Promise<boolean>;
  project: NonNullable<E2EStreamOptions["project"]>;
  skillIds: string[];
  /** Returns the answer with the saved paths written into its artifact tags. */
  saveArtifacts: (content: string) => Promise<string>;
}

/**
 * Decrypts what a project gives its chat: name and goal, its memory (plus the
 * user's "You" folder when it's read live), the Library index and the connectors
 * it allows. Null outside a project. A project that fails to load gives an empty
 * context rather than the user's memory: a project chat never reads that.
 */
async function projectTurn(chat: Chat | null): Promise<ProjectTurn | null> {
  const projectId = chat?.project_id;
  if (!projectId) return null;
  const none: ProjectTurn = {
    context: "",
    memoryFiles: [],
    memoryWrites: false,
    applyMemoryEdit: async () => false,
    project: { files: [], read: async () => new Map(), connectorIds: [] },
    skillIds: [],
    saveArtifacts: (content) => saveArtifactsToLibrary(projectId, content),
  };
  try {
    const [project, listing] = await Promise.all([getProject(projectId), listProjectFiles(projectId)]);
    const { settings } = project;
    const [memory, you] = await Promise.all([
      settings.memory ? listProjectMemory(projectId) : Promise.resolve([]),
      settings.you === "live" ? getYouFilesForProject() : Promise.resolve([]),
    ]);
    return {
      context: [`Project: ${project.name}`, project.goal && `Goal: ${project.goal}`].filter(Boolean).join("\n"),
      memoryFiles: [
        ...you.map((f) => ({ ...f, category: "You", readOnly: true })),
        ...memory.map((f) => ({ id: f.id, category: "Memory", name: f.name, description: f.description, content: f.content, updatedAt: f.updated_at })),
      ],
      memoryWrites: settings.memory && getMemorySettings().liveWrites,
      applyMemoryEdit: applyProjectMemoryEdit(projectId),
      project: {
        files: listing.files.map((f) => ({ id: f.id, path: f.path, size: f.size, preview: f.preview })),
        read: (ids) => readProjectFiles(projectId, listing.files.filter((f) => ids.includes(f.id))),
        connectorIds: settings.connectorIds,
      },
      skillIds: settings.skillIds,
      saveArtifacts: none.saveArtifacts,
    };
  } catch {
    return none;
  }
}

// A chat whose metadata didn't load counts as memory-off: the user may have
// switched memory off for it, and we can't tell.
async function memoryFilesFor(chat: Chat | null): ReturnType<typeof getMemoryFilesForChat> {
  if (chat?.project_id || chat?.memory_enabled !== true) return [];
  return getMemoryFilesForChat();
}

// Fetched at once: one after another they added ~0.3 s before every answer.
async function loadTurnContext(key: CryptoKey, chatId: string, history: HistoryMessage[]) {
  const customInstructions = getCustomInstructionsContext();
  const chatMeta = await getChat(chatId).catch(() => null);
  const inProject = projectTurn(chatMeta);
  const [since, project, memoryFiles, skills, instructions] = await Promise.all([
    sinceSummary(key, chatId, chatMeta, history),
    inProject,
    memoryFilesFor(chatMeta),
    inProject.then((p) => getSkillsForChat(p?.skillIds)),
    customInstructions,
  ]);
  return { since, inProject: project, memoryFiles: project ? project.memoryFiles : memoryFiles, skills, customInstructions: instructions };
}

type TurnContext = Pick<
  E2EStreamOptions,
  | "displayName"
  | "projectContext"
  | "conversationSummary"
  | "memoryFiles"
  | "skills"
  | "customInstructions"
  | "memoryWrites"
  | "connectors"
  | "signal"
  | "project"
  | "applyMemoryEdit"
>;

async function streamTurn(
  content: string,
  model: ModelType,
  history: ChatTurn[],
  onToken: (token: string) => void,
  ctx: TurnContext,
  webSearch: boolean,
  onActivity: ((activity: AnswerActivity) => void) | undefined,
  images: ChatImage[],
  files: ChatTextFile[],
  onTitle: ((title: string) => void) | undefined,
  onBrief?: (brief: string) => void
) {
  const readsImages = modelSupportsImages(model);
  if (images.length > 0 && !readsImages) throw new Error(IMAGES_UNSUPPORTED_NOTE);
  const storedContent = packMessageContent(content, images, files);

  // The <chat_title> block is extracted from the stream and never shown. Filter order matters: the title filter runs before the project-brief filter.
  // Both are applied only once the answer is verified.
  const written: { title?: string; brief?: string } = {};
  const briefFilter = onBrief ? createTagFilter(BRIEF_OPEN, BRIEF_CLOSE, onToken, (brief) => (written.brief = brief)) : null;
  const afterTitle = briefFilter ? briefFilter.push : onToken;
  const titleFilter = onTitle ? createTagFilter(TITLE_OPEN, TITLE_CLOSE, afterTitle, (title) => (written.title = title)) : null;
  const emitToken = titleFilter ? titleFilter.push : afterTitle;

  const turns: ChatTurn[] = [...history, { role: "user", content: storedContent }];
  const reasoningEffort = resolveReasoningEffort(model);

  // E2E path: the browser composes and encrypts the request; the backend only proxies it. The only plaintext the backend sees here is the finished search query and the address of a page the model reads.
  const { text: response, provider, inputTokens, outputTokens } = await streamE2EChat(
    {
      provider: requireProvider(model),
      model,
      turns: turnsForAI(turns, readsImages),
      ...ctx,
      generateTitle: Boolean(onTitle),
      generateBrief: Boolean(onBrief),
      webSearch,
      reasoningEffort,
      onActivity,
      applyMemoryEdit: ctx.applyMemoryEdit ?? applyLiveMemoryEdit,
    },
    emitToken
  );
  titleFilter?.flush();
  briefFilter?.flush();

  const cleanResponse = onTitle || onBrief ? stripTitleBlock(response) : response;
  requireAnswer(cleanResponse);
  if (!isUnverifiedAnswer(cleanResponse)) {
    if (written.title !== undefined) onTitle?.(written.title);
    if (written.brief !== undefined) onBrief?.(written.brief);
  }

  return {
    userContent: storedContent,
    // Exactly what was on screen, in order, or the Processing section vanishes when the streamed message is replaced by the saved one.
    assistantContent: cleanResponse,
    provider,
    inputTokens,
    outputTokens,
  };
}

export async function sendMessage(
  chatId: string,
  content: string,
  model: ModelType,
  history: HistoryMessage[],
  onToken: (token: string) => void,
  webSearch: boolean = false,
  onActivity?: (activity: AnswerActivity) => void,
  images: ChatImage[] = [],
  files: ChatTextFile[] = [],
  onTitle?: (title: string) => void,
  signal?: AbortSignal,
  discard: string[] = []
): Promise<Message[]> {
  const key = await requireAesKey();
  const { since, inProject, memoryFiles, skills, customInstructions } = await loadTurnContext(key, chatId, history);
  const ctx: TurnContext = {
    displayName: getUser()?.display_name ?? "",
    projectContext: inProject?.context ?? "",
    conversationSummary: since.summary,
    memoryFiles,
    skills,
    customInstructions,
    memoryWrites: inProject ? inProject.memoryWrites : getMemorySettings().liveWrites,
    applyMemoryEdit: inProject?.applyMemoryEdit,
    project: inProject?.project,
    connectors: true,
    signal,
  };

  const onBrief =
    inProject && history.length === 0
      ? (brief: string) => {
          void setChatBrief(chatId, brief)
            .then(() => window.dispatchEvent(new CustomEvent("karui-reload-chats")))
            .catch(() => {});
        }
      : undefined;

  const turn = await streamTurn(content, model, since.history, onToken, ctx, webSearch, onActivity, images, files, onTitle, onBrief);
  // Retries don't save: a retry repeats the answer, not its actions. Neither does an unverified answer.
  const assistantContent = inProject && !isUnverifiedAnswer(turn.assistantContent)
    ? await inProject.saveArtifacts(turn.assistantContent)
    : turn.assistantContent;
  return appendMessages(
    chatId,
    key,
    [
      { role: "user", content: turn.userContent, model, tokens: turn.inputTokens },
      { role: "assistant", content: assistantContent, model, provider: turn.provider, tokens: turn.outputTokens },
    ],
    discard
  );
}

export const INCOGNITO_CHAT_ID = "incognito";

/**
 * An incognito turn: nothing from the user's account goes in (no memory, custom
 * instructions, project, connectors or title) and nothing is saved — the returned
 * messages live only in the caller's state, so they vanish with the page.
 */
export async function sendIncognitoMessage(
  content: string,
  model: ModelType,
  history: ChatTurn[],
  onToken: (token: string) => void,
  webSearch: boolean,
  onActivity?: (activity: AnswerActivity) => void,
  images: ChatImage[] = [],
  files: ChatTextFile[] = []
): Promise<Message[]> {
  const ctx: TurnContext = {
    displayName: "",
    projectContext: "",
    conversationSummary: "",
    memoryFiles: [],
    skills: [],
    customInstructions: "",
    memoryWrites: false,
    connectors: false,
  };
  const turn = await streamTurn(content, model, history, onToken, ctx, webSearch, onActivity, images, files, undefined);
  const base = { chat_id: INCOGNITO_CHAT_ID, model, pinned: false, created_at: new Date().toISOString() };
  return [
    { ...base, id: crypto.randomUUID(), role: "user", content: turn.userContent, tokens: turn.inputTokens },
    { ...base, id: crypto.randomUUID(), role: "assistant", content: turn.assistantContent, provider: turn.provider, tokens: turn.outputTokens },
  ];
}

// Deletes the summary when it covers the message, or when that cannot be determined. Deleting unnecessarily costs one extra summary; keeping a stale one silently misleads the model.
async function invalidateSummaryIfCovered(
  key: CryptoKey,
  chatId: string,
  changedMessageId: string
): Promise<void> {
  const chat = await getChat(chatId).catch(() => null);
  if (!chat?.summary) return;

  let covered = true;
  const boundaryId = chat.summary_up_to_message_id;
  if (boundaryId) {
    try {
      const positions = await getMessagePositions(chatId);
      const boundary = positions.get(boundaryId);
      const changed = positions.get(changedMessageId);
      covered = boundary === undefined || changed === undefined || changed <= boundary;
    } catch {
      covered = true;
    }
  }

  if (covered) {
    await clearChatSummary(key, chatId).catch(() => {});
  }
}

/**
 * Drops the summary when the user switches the shown variant of a message it
 * covers: the summary would describe the other variant.
 */
export async function invalidateSummaryForMessage(chatId: string, messageId: string): Promise<void> {
  await invalidateSummaryIfCovered(await requireAesKey(), chatId, messageId);
}

// Runs only on user request, never in the background: compression is a paid model call from a shared pool.
export async function compressChatNow(
  chatId: string,
  model: ModelType,
  history: HistoryMessage[]
): Promise<CompressionOutcome> {
  const key = await requireAesKey();
  const [chat, budget] = await Promise.all([getChat(chatId), contextBudgetFor(model)]);
  const cut = afterSummary(history, chat.summary ? chat.summary_up_to_message_id : undefined);
  const { turns, ids } = modelTurns(cut.messages);

  return maybeCompressChat({
    key,
    chatId,
    modelId: model,
    turns,
    messageIds: ids,
    previousSummary: cut.valid ? (chat.summary ?? "") : "",
    budget,
    tier: getUser()?.tier ?? "free",
  });
}

// A failed check does not close the gate: a false block is worse than none.
export async function getCompressionGate(
  chatId: string,
  history: HistoryMessage[],
  model: ModelType
): Promise<{ required: boolean; quota: CompressionQuota | null }> {
  const budget = await contextBudgetFor(model);
  const tier = getUser()?.tier ?? "free";
  const open = { required: false, quota: null };
  if (!compressionRequired(modelTurns(history).turns, budget, tier)) return open;

  const chat = await getChat(chatId).catch(() => null);
  if (!chat) return open;
  const cut = afterSummary(history, chat.summary ? chat.summary_up_to_message_id : undefined);
  if (!compressionRequired(modelTurns(cut.messages).turns, budget, tier)) return open;

  const quota = await getCompressionQuota().catch(() => null);
  return { required: true, quota };
}

export async function retryMessage(
  chatId: string,
  origAssistantId: string,
  origVariantGroup: string | undefined,
  model: ModelType,
  history: HistoryMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const key = await requireAesKey();
  // A retry rewrites history retroactively, so the summary may describe a
  // conversation that no longer exists. We invalidate it BEFORE fetching —
  // otherwise this turn would still go out with the old one.
  await invalidateSummaryIfCovered(key, chatId, origAssistantId);

  const { since, inProject, memoryFiles, skills, customInstructions } = await loadTurnContext(key, chatId, history);
  const projectContext = inProject?.context ?? "";
  const reasoningEffort = resolveReasoningEffort(model);
  const variantGroup = origVariantGroup || crypto.randomUUID();

  const { text: response, provider, outputTokens } = await streamE2EChat(
    {
      provider: requireProvider(model),
      model,
      turns: turnsForAI(since.history, modelSupportsImages(model)),
      displayName: getUser()?.display_name ?? "",
      projectContext,
      conversationSummary: since.summary,
      memoryFiles,
      skills,
      customInstructions,
      generateTitle: false,
      webSearch: false,
      // A retry repeats the answer, not the actions: tools that change data
      // already ran once, after the user allowed them.
      connectors: false,
      project: inProject?.project,
      reasoningEffort,
      signal,
    },
    onToken
  );

  requireAnswer(response);

  if (!origVariantGroup) {
    await apiCall<void>(`/api/chats/${chatId}/messages/${origAssistantId}/variant`, {
      method: "PATCH",
      body: JSON.stringify({ variant_group: variantGroup }),
    });
  }

  // Return exactly what was saved: ChatWindow finds the new variant by matching m.content to retryResponse.
  await appendMessages(chatId, key, [
    { role: "assistant", content: response, model, provider, variant_group: variantGroup, tokens: outputTokens },
  ]);

  return response;
}

export interface BillingStatus {
  tier: string;
  tokens_used: number;
  tokens_limit: number;
  window_hours: number;
  window_reset_at?: string;
  week_tokens_used?: number;
  week_tokens_limit?: number;
  week_reset_at?: string;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return apiCall<BillingStatus>("/api/billing/status", { method: "GET" });
}
