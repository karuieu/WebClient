// Keep one stream per chat outside component lifetimes so navigation does not interrupt generation or persistence.

import {
  sendMessage,
  retryMessage,
  setChatBrief,
  type Message,
  type ModelType,
} from "./chat";
import { type HistoryMessage } from "./conversation";
import { maybeAutoMemory } from "./memory";
import { type ChatImage, type ChatTextFile } from "./vision";
import { applyChatTitle, fallbackTitleChat, getChatTitleMode } from "./chatTitle";
import { throwIfStopped } from "./errors";
import { type AnswerActivity } from "./answerTools";

export type StreamPhase = "streaming" | "done" | "error";

export interface ChatStreamState {
  phase: StreamPhase;
  kind: "send" | "retry";
  userMessage: Message | null;
  request: { content: string; model: ModelType; images: ChatImage[]; files: ChatTextFile[] };
  content: string;
  activity: AnswerActivity | null;

  saved: Message[] | null;
  retryResponse: string | null;
  discarded: string[];
  error: unknown;
}

const streams = new Map<string, ChatStreamState>();
const controllers = new Map<string, AbortController>();

// The turn keeps its lock until in-flight work finishes, even after Stop.
export function stopChatStream(chatId: string): void {
  controllers.get(chatId)?.abort();
}

function startController(chatId: string): AbortSignal {
  const controller = new AbortController();
  controllers.set(chatId, controller);
  return controller.signal;
}
const listeners = new Map<string, Set<() => void>>();

function notify(chatId: string) {
  listeners.get(chatId)?.forEach((fn) => fn());
}

export function getChatStream(chatId: string): ChatStreamState | null {
  return streams.get(chatId) ?? null;
}

export function clearChatStream(chatId: string): void {
  streams.delete(chatId);
}

export function subscribeChatStream(chatId: string, fn: () => void): () => void {
  let set = listeners.get(chatId);
  if (!set) {
    set = new Set();
    listeners.set(chatId, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(chatId);
  };
}

export function startSendStream(opts: {
  chatId: string;
  content: string;
  model: ModelType;
  history: HistoryMessage[];
  webSearch: boolean;
  userMessage: Message;
  images?: ChatImage[];
  files?: ChatTextFile[];
  discard?: string[];
  ready?: Promise<void>;
}): boolean {
  const { chatId } = opts;
  if (controllers.has(chatId)) return false;
  const state: ChatStreamState = {
    phase: "streaming",
    kind: "send",
    userMessage: opts.userMessage,
    request: { content: opts.content, model: opts.model, images: opts.images ?? [], files: opts.files ?? [] },
    content: "",
    activity: null,
    saved: null,
    retryResponse: null,
    discarded: [],
    error: null,
  };
  streams.set(chatId, state);

  const isFirstMessage = opts.history.length === 0;
  const imageNames = (opts.images ?? []).map((i) => i.name);
  const wantAiTitle = isFirstMessage && getChatTitleMode() === "ai";
  let titleCaptured = false;
  const signal = startController(chatId);

  void (async () => {
    try {
      await opts.ready;
      throwIfStopped(signal);
      if (isFirstMessage && !wantAiTitle) {
        void fallbackTitleChat(chatId, opts.content, imageNames);
      }
      const saved = await sendMessage(
        chatId,
        opts.content,
        opts.model,
        opts.history,
        (token) => {
          state.activity = null;
          state.content += token;
          notify(chatId);
        },
        opts.webSearch,
        (activity) => {
          state.activity = activity;
          notify(chatId);
        },
        opts.images ?? [],
        opts.files ?? [],
        wantAiTitle
          ? (title) => {
              titleCaptured = true;
              void applyChatTitle(chatId, title);
            }
          : undefined,
        signal,
        opts.discard ?? []
      );
      if (wantAiTitle && !titleCaptured) {
        void fallbackTitleChat(chatId, opts.content, imageNames);
      }
      state.phase = "done";
      state.saved = saved;
      state.discarded = opts.discard ?? [];
      // Notify the sidebar even when the chat window is unmounted.
      window.dispatchEvent(new CustomEvent("karui-reload-chats"));
      if (!signal.aborted) void maybeAutoMemory(setChatBrief);
    } catch (error) {
      state.phase = "error";
      state.error = error;
    }
    controllers.delete(chatId);
    notify(chatId);
  })();
  return true;
}

export function startRetryStream(opts: {
  chatId: string;
  assistantId: string;
  variantGroup: string | undefined;
  model: ModelType;
  history: HistoryMessage[];
}): boolean {
  const { chatId } = opts;
  if (controllers.has(chatId)) return false;
  const state: ChatStreamState = {
    phase: "streaming",
    kind: "retry",
    userMessage: null,
    request: { content: "", model: opts.model, images: [], files: [] },
    content: "",
    activity: null,
    saved: null,
    retryResponse: null,
    discarded: [],
    error: null,
  };
  streams.set(chatId, state);
  const signal = startController(chatId);

  void (async () => {
    try {
      const response = await retryMessage(
        chatId,
        opts.assistantId,
        opts.variantGroup,
        opts.model,
        opts.history,
        (token) => {
          state.content += token;
          notify(chatId);
        },
        signal
      );
      state.phase = "done";
      state.retryResponse = response;
    } catch (error) {
      state.phase = "error";
      state.error = error;
    }
    controllers.delete(chatId);
    notify(chatId);
  })();
  return true;
}
