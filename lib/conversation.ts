// The conversation as the model sees it. Sending, retrying and compression all build history here, so they cannot disagree.

import type { ChatTurn } from "./chat";

export type HistoryMessage = ChatTurn & {
  id: string;
  variant_group?: string;
  decryptionFailed?: boolean;
};

// Retry variants collapse into one, placed where the group's first member sits. Database order would put a retry after the latest turn.
export function visibleMessages<T extends { variant_group?: string }>(
  messages: T[],
  selection: Record<string, number>
): (T & { variant?: { index: number; total: number } })[] {
  const out: (T & { variant?: { index: number; total: number } })[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    if (!m.variant_group) {
      out.push(m);
      continue;
    }
    if (seen.has(m.variant_group)) continue;
    seen.add(m.variant_group);
    const group = messages.filter((x) => x.variant_group === m.variant_group);
    const i = Math.min(Math.max(0, selection[m.variant_group] ?? group.length - 1), group.length - 1);
    out.push({ ...group[i], variant: { index: i + 1, total: group.length } });
  }
  return out;
}

// Messages after the summary boundary. If the boundary is missing, the summary describes a conversation not on screen: valid is false and the caller must drop it.
export function afterSummary<T extends { id: string }>(
  messages: T[],
  boundaryId: string | undefined
): { messages: T[]; valid: boolean } {
  if (!boundaryId) return { messages, valid: true };
  const at = messages.findIndex((m) => m.id === boundaryId);
  if (at < 0) return { messages, valid: false };
  return { messages: messages.slice(at + 1), valid: true };
}
