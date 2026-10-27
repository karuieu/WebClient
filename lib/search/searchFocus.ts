/**
 * Hands a search hit from the palette to the chat it opens. Kept in memory and
 * never in the URL: on a reload the address reaches our server and its logs,
 * and the search terms are the user's plaintext.
 */

import { onSessionCleared } from "@/lib/account/session";

export type SearchFocus = { chatId: string; messageId: string; terms: string[] };

let pending: SearchFocus | null = null;
const listeners = new Set<() => void>();

function set(next: SearchFocus | null): void {
  pending = next;
  listeners.forEach((l) => l());
}

export function setPendingFocus(focus: SearchFocus): void {
  set(focus);
}

/** Subscribed rather than read once: picking a hit in the chat already open doesn't remount it. */
export function subscribePendingFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read without clearing: React's dev double render would otherwise lose it. The chat clears it once applied. */
export function peekPendingFocus(chatId: string): SearchFocus | null {
  return pending?.chatId === chatId ? pending : null;
}

export function clearPendingFocus(): void {
  if (pending) set(null);
}

onSessionCleared(clearPendingFocus);
