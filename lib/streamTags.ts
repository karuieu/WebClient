
// Pulls tags out of the stream as soon as they close: the title and brief of a first answer, and the answer's search call.
// Tokens that may be the start of a tag are held back until resolved.

export const TITLE_OPEN = "<chat_title>";
export const TITLE_CLOSE = "</chat_title>";
export const BRIEF_OPEN = "<chat_brief>";
export const BRIEF_CLOSE = "</chat_brief>";
const TITLE_BLOCK_MAX_CHARS = 300;

export function trailingTagPrefixLen(s: string, tag: string): number {
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

export const SEARCH_CALL_OPEN = "<search_query>";
export const SEARCH_CALL_CLOSE = "</search_query>";
const MAX_QUERY_CHARS = 200;
// A call is a short single line between the tags. Anything else is the model talking about the tag, often in its reasoning.
const SEARCH_CALL = new RegExp(`${SEARCH_CALL_OPEN}([^<\\n]{1,${MAX_QUERY_CHARS}})${SEARCH_CALL_CLOSE}`);

export function searchCallIndex(text: string): number {
  return text.search(SEARCH_CALL);
}

// Where the tail of the text could still turn into a search call.
function partialCallStart(text: string): number {
  const open = text.lastIndexOf(SEARCH_CALL_OPEN);
  if (open !== -1) {
    const after = text.slice(open + SEARCH_CALL_OPEN.length);
    const lt = after.indexOf("<");
    const query = lt === -1 ? after : after.slice(0, lt);
    const closing = lt === -1 ? "" : after.slice(lt);
    const stillCall = !query.includes("\n") && query.length <= MAX_QUERY_CHARS && closing.length < SEARCH_CALL_CLOSE.length && SEARCH_CALL_CLOSE.startsWith(closing);
    if (stillCall) return open;
  }
  return text.length - trailingTagPrefixLen(text, SEARCH_CALL_OPEN);
}

// Takes the first search call out of the stream. The rest of that chunk is dropped, as the client cuts its text there;
// what the client sends after the cut (a closing </reasoning>) passes through.
export function createSearchCallFilter(emit: (token: string) => void, onCall: (query: string) => void) {
  let pending = "";
  let called = false;

  const push = (token: string) => {
    if (called) {
      emit(token);
      return;
    }
    pending += token;
    const match = SEARCH_CALL.exec(pending);
    if (match) {
      called = true;
      if (match.index > 0) emit(pending.slice(0, match.index));
      pending = "";
      onCall(match[1].trim());
      return;
    }
    const hold = partialCallStart(pending);
    if (hold > 0) emit(pending.slice(0, hold));
    pending = pending.slice(hold);
  };

  const flush = () => {
    if (pending) emit(pending);
    pending = "";
  };

  return { push, flush };
}
