
// Extracts <chat_title> from the stream as soon as it closes. Tokens that may be the start of a tag are held back until resolved.

export const TITLE_OPEN = "<chat_title>";
export const TITLE_CLOSE = "</chat_title>";
export const BRIEF_OPEN = "<chat_brief>";
export const BRIEF_CLOSE = "</chat_brief>";
const TITLE_BLOCK_MAX_CHARS = 300;

function trailingTagPrefixLen(s: string, tag: string): number {
  const max = Math.min(s.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (s.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}

export function createTagFilter(open: string, close: string, emit: (token: string) => void, onValue: (value: string) => void) {
  let pending = "";
  let done = false;

  const push = (token: string) => {
    if (done) {
      emit(token);
      return;
    }
    pending += token;

    const openIdx = pending.indexOf(open);
    if (openIdx === -1) {
      const hold = trailingTagPrefixLen(pending, open);
      const out = pending.slice(0, pending.length - hold);
      pending = pending.slice(pending.length - hold);
      if (out) emit(out);
      return;
    }

    const closeIdx = pending.indexOf(close, openIdx + open.length);
    if (closeIdx === -1) {
      if (pending.length - openIdx > TITLE_BLOCK_MAX_CHARS) {

        done = true;
        emit(pending);
        pending = "";
        return;
      }

      const out = pending.slice(0, openIdx);
      pending = pending.slice(openIdx);
      if (out) emit(out);
      return;
    }

    const value = pending.slice(openIdx + open.length, closeIdx).trim();
    const rest = pending.slice(0, openIdx) + pending.slice(closeIdx + close.length);
    done = true;
    pending = "";
    if (value) onValue(value);
    if (rest) emit(rest);
  };

  const flush = () => {
    if (pending) {
      emit(pending);
      pending = "";
    }
  };

  return { push, flush };
}

export function stripTitleBlock(response: string): string {
  return response
    .replace(/<chat_title>[\s\S]*?<\/chat_title>/, "")
    .replace(/<chat_brief>[\s\S]*?<\/chat_brief>/, "")
    .trimStart();
}
