/**
 * Chat API client. Content is encrypted in the browser; the server stores and returns ciphertext only.
 * The AES key never reaches the server.
 */

import { ensureAesKey, getUser } from "./session";
import { decryptField, encryptField, fieldAad, messageAad } from "./crypto";
import { getProject, listProjectFiles, listProjectMemory, readProjectFiles } from "./projects";
import {
  applyLiveMemoryEdit,
  applyProjectMemoryEdit,
  getMemoryFilesForChat,
  getMemorySettings,
  getYouFilesForProject,
  type LiveMemoryEdit,
  type MemoryFileForChat,
} from "./memory";
import { stripMemoryWriteBlocks } from "./memoryWrite";
import { parseMessageBlocks } from "./messageBlocks";
import { getCustomInstructionsContext } from "./customInstructions";
import { getSkillsForChat } from "./skills";
import { BRIEF_CLOSE, BRIEF_OPEN, TITLE_CLOSE, TITLE_OPEN, createTagFilter, stripTitleBlock } from "./streamTags";
import { resolveReasoningEffort } from "./reasoning";
import { streamE2EChat, contextBudgetFor, ensureModelAvailable, type E2EStreamOptions } from "./inference";
import { type AnswerActivity } from "./answerTools";
import { getModelProvider, type ProviderId } from "./providers";
import {
  maybeCompressChat,
  clearChatSummary,
  compressionRequired,
  getCompressionQuota,
  type CompressionOutcome,
  type CompressionQuota,
} from "./compression";
import { afterSummary, type HistoryMessage } from "./conversation";
import { RateLimitError } from "./errors";
import {
  type ChatImage,
  type ChatTextFile,
  packMessageContent,
  turnContentForAI,
  modelSupportsImages,
  IMAGES_UNSUPPORTED_NOTE,
} from "./vision";
import { API_URL, JSON_HEADERS, apiFetch } from "./api";

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

export type ChatTurn = { role: "user" | "assistant"; content: string };

// Shown in place of undecryptable content. A label for humans, not conversation: turnsForAI filters on it before the model sees the history.
export const UNDECRYPTABLE_PLACEHOLDER = "(unable to decrypt)";

// <notice> blocks are UI metadata. Strip them from history, or the model reacts to them (e.g. apologising for 'memory skipped').
export function stripNoticeBlocks(content: string): string {
  return content
    .replace(/<notice>[\s\S]*?<\/notice>/g, "")
    .replace(/<tool>[\s\S]*?<\/tool>/g, "")
    .replace(/<library>[\s\S]*?<\/library>/g, "")
    .replace(/<skills_used>[\s\S]*?<\/skills_used>/g, "")
    .replace(/<helper_message>[\s\S]*?(?:<\/helper_message>|$)/g, "");
}

// Strip UI-only and helper-phase blocks from history. <memory_write> makes the model repeat saved notes; <reasoning> leaks into visible replies. Every path that sends history must go through this function.
export function stripHiddenBlocks(content: string): string {
  return stripReasoningBlocks(stripMemoryWriteBlocks(stripNoticeBlocks(content)));
}

function stripReasoningBlocks(content: string): string {
  return content.replace(/<reasoning>([\s\S]*?)(?:<\/reasoning>|$)/g, (_, inner: string) => {
    const leak = inner.indexOf("</think>");
    return leak === -1 ? "" : inner.slice(leak + "</think>".length);
  });
}

// The only bottleneck between chat history and the model. Undecryptable turns are dropped here, not in each caller, because a placeholder would be answered by the model.
function turnsForAI(turns: ChatTurn[], readsImages: boolean) {
  return turns
    .filter((t) => t.content.trim() !== UNDECRYPTABLE_PLACEHOLDER)
    .map((t) => {
    const { content, images } = turnContentForAI(stripHiddenBlocks(t.content), readsImages);
    return {
      role: t.role,
      content,
      ...(images && images.length > 0 ? { images } : {}),
    };
  });
}

// Turns as the model reads them, for measuring and summarising. Images count as their description; counting base64 would trip the compression gate.
function modelTurns(messages: HistoryMessage[]): { turns: ChatTurn[]; ids: string[] } {
  const kept = messages.filter((m) => !m.decryptionFailed && m.content.trim() !== UNDECRYPTABLE_PLACEHOLDER);
  return {
    turns: kept.map((m) => ({ role: m.role, content: turnContentForAI(stripHiddenBlocks(m.content), false).content })),
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
  const raw = await apiCall<RawMessage[]>(`/api/chats/${chatId}/messages/batch`, {
    method: "POST",
    body: JSON.stringify({ messages, ...(discard.length > 0 ? { discard } : {}) }),
  });
  return Promise.all(raw.map((r) => decryptMessageRow(key, r)));
}

interface ProjectTurn {

  context: string;
  memoryFiles: MemoryFileForChat[];
  memoryWrites: boolean;
  applyMemoryEdit: (edit: LiveMemoryEdit) => Promise<boolean>;
  project: NonNullable<E2EStreamOptions["project"]>;
  skillIds: string[];
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

type TurnContext = Pick<
  E2EStreamOptions,
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
  const briefFilter = onBrief ? createTagFilter(BRIEF_OPEN, BRIEF_CLOSE, onToken, onBrief) : null;
  const afterTitle = briefFilter ? briefFilter.push : onToken;
  const titleFilter = onTitle ? createTagFilter(TITLE_OPEN, TITLE_CLOSE, afterTitle, onTitle) : null;
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
  if (!parseMessageBlocks(cleanResponse).answer.trim()) throw new Error("The model returned an empty response");

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
  const chatMeta = await getChat(chatId).catch(() => null);
  const since = await sinceSummary(key, chatId, chatMeta, history);
  const inProject = await projectTurn(chatMeta);
  const ctx: TurnContext = {
    projectContext: inProject?.context ?? "",
    conversationSummary: since.summary,
    memoryFiles: inProject ? inProject.memoryFiles : await memoryFilesFor(chatMeta),
    skills: await getSkillsForChat(inProject?.skillIds),
    customInstructions: await getCustomInstructionsContext(),
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
  return appendMessages(
    chatId,
    key,
    [
      { role: "user", content: turn.userContent, model, tokens: turn.inputTokens },
      { role: "assistant", content: turn.assistantContent, model, provider: turn.provider, tokens: turn.outputTokens },
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

  const chatMeta = await getChat(chatId).catch(() => null);
  const since = await sinceSummary(key, chatId, chatMeta, history);
  const inProject = await projectTurn(chatMeta);
  const projectContext = inProject?.context ?? "";
  const memoryFiles = inProject ? inProject.memoryFiles : await memoryFilesFor(chatMeta);
  const skills = await getSkillsForChat(inProject?.skillIds);
  const customInstructions = await getCustomInstructionsContext();
  const reasoningEffort = resolveReasoningEffort(model);
  const variantGroup = origVariantGroup || crypto.randomUUID();

  const { text: response, provider, outputTokens } = await streamE2EChat(
    {
      provider: requireProvider(model),
      model,
      turns: turnsForAI(since.history, modelSupportsImages(model)),
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

  if (!parseMessageBlocks(response).answer.trim()) throw new Error("The model returned an empty response");

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
