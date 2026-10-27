// Titles are encrypted in the browser before they are saved.

import { getChat, renameChat } from "./chat";
import { accountSettingKey } from "@/lib/account/session";

export type ChatTitleMode = "ai" | "first-message";

const MODE_KEY = "karui_chat_title_mode";
const DEFAULT_MODE: ChatTitleMode = "ai";

const TITLE_MAX_CHARS = 60;

export function getChatTitleMode(): ChatTitleMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(accountSettingKey(MODE_KEY));
    return raw === "ai" || raw === "first-message" ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function setChatTitleMode(mode: ChatTitleMode): void {
  try {
    window.localStorage.setItem(accountSettingKey(MODE_KEY), mode);
  } catch {}
}

function clipTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX_CHARS) return oneLine;
  return oneLine.slice(0, TITLE_MAX_CHARS).trimEnd() + "…";
}

/** Update only default-titled chats so manual names are preserved; failures leave "New chat" unchanged. */
export async function applyChatTitle(chatId: string, title: string): Promise<void> {
  const cleaned = clipTitle(title);
  if (!cleaned) return;
  try {
    const chat = await getChat(chatId);
    if (chat.title && chat.title !== "New chat") return;

    await renameChat(chatId, cleaned);
    window.dispatchEvent(
      new CustomEvent("karui-chat-renamed", { detail: { id: chatId, title: cleaned } })
    );
    window.dispatchEvent(new CustomEvent("karui-reload-chats"));
  } catch {
  }
}

export async function fallbackTitleChat(
  chatId: string,
  firstMessage: string,
  imageNames: string[] = []
): Promise<void> {
  const title = firstMessage.trim() || imageNames[0] || "";
  if (!title) return;
  await applyChatTitle(chatId, title);
}
