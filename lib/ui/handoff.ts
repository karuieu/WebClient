import type { ChatImage, ChatTextFile } from "@/lib/messages/vision";
import type { ModelType } from "@/lib/chat/chat";

/**
 * Hold the first message in module memory across /new → /chat navigation so plaintext never touches browser
 * disk.   A hard reload during handoff loses it; client navigation preserves the module.
 */
export interface FirstMessage {
  content: string;
  model: ModelType;
  webSearch: boolean;
  images: ChatImage[];
  files: ChatTextFile[];
}

const pending = new Map<string, FirstMessage>();

export function stashFirstMessage(chatId: string, message: FirstMessage): void {
  pending.set(chatId, message);
}

/** Consume the message once so remounts cannot send it twice. */
export function takeFirstMessage(chatId: string): FirstMessage | null {
  const message = pending.get(chatId) ?? null;
  pending.delete(chatId);
  return message;
}
