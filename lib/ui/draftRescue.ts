import { onSessionCleared } from "@/lib/account/session";

/**
 * Rescue drafts in module memory across client navigation after session expiry.   Hard reloads lose the
 * draft; sessionStorage/localStorage would leave plaintext on disk after logout.
 */
let rescuedDraft: string | null = null;

export function saveDraft(text: string): void {
  const trimmed = text.trim();
  if (trimmed) rescuedDraft = trimmed;
}

export const DRAFT_OFFERED_EVENT = "karui-draft-offered";

/** Puts text in the /new composer without sending it, whether /new is already open or opens next. */
export function offerDraft(text: string): void {
  saveDraft(text);
  window.dispatchEvent(new Event(DRAFT_OFFERED_EVENT));
}

export function takeDraft(): string | null {
  const draft = rescuedDraft;
  rescuedDraft = null;
  return draft;
}

export function registerDraftRescue(readDraft: () => string): () => void {
  return onSessionCleared(() => {
    try {
      saveDraft(readDraft());
    } catch {
    }
  });
}
