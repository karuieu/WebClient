
// Pulls tags out of the stream as soon as they close: the title and brief of a first answer, the answer's memory note, and its calls.
// Tokens that may be the start of a tag are held back until resolved.

export const TITLE_OPEN = "<chat_title>";
export const TITLE_CLOSE = "</chat_title>";
export const BRIEF_OPEN = "<chat_brief>";
export const BRIEF_CLOSE = "</chat_brief>";
export const MEMORY_NOTE_OPEN = "<memory_note>";
export const MEMORY_NOTE_CLOSE = "</memory_note>";
const TITLE_BLOCK_MAX_CHARS = 300;

export function trailingTagPrefixLen(s: string, tag: string): number {
  const max = Math.min(s.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (s.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}

export function createTagFilter(
  open: string,
  close: string,
  emit: (token: string) => void,
  onValue: (value: string) => void,
  maxChars = TITLE_BLOCK_MAX_CHARS
) {
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
      if (pending.length - openIdx > maxChars) {

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

export function stripMemoryNotes(text: string): string {
  return text.replace(/<memory_note>[\s\S]*?<\/memory_note>/g, "");
}

export type CallTag = "search_query" | "fetch_url" | "read" | "tool_call";

export interface AnswerCall {
  tag: CallTag;
  value: string;
}

const QUERY_MAX_CHARS = 200;
const URL_MAX_CHARS = 2048;
const TOOL_CALL_MAX_CHARS = 4000;

// A call is a single line between the tags. Anything else is the model talking about the tag, often in its reasoning.
const CALL_VALUE: Record<CallTag, string> = {
  search_query: `[^<\\n]{1,${QUERY_MAX_CHARS}}`,
  fetch_url: ` *https?://[^\\s<]{1,${URL_MAX_CHARS}} *`,
  read: `[^<\\n]{1,${QUERY_MAX_CHARS}}`,
  // Tool arguments are JSON, whose strings may contain "<".
  tool_call: `\\{[^\\n]{0,${TOOL_CALL_MAX_CHARS}}?\\}`,
};

const CALL_MAX_CHARS: Record<CallTag, number> = {
  search_query: QUERY_MAX_CHARS,
  fetch_url: URL_MAX_CHARS + 10,
  read: QUERY_MAX_CHARS,
  tool_call: TOOL_CALL_MAX_CHARS + 2,
};

function findCall(text: string, tags: CallTag[]): { index: number; call: AnswerCall } | null {
  let first: { index: number; call: AnswerCall } | null = null;
  for (const tag of tags) {
    const match = new RegExp(`<${tag}>(${CALL_VALUE[tag]})</${tag}>`).exec(text);
    if (match && (!first || match.index < first.index)) first = { index: match.index, call: { tag, value: match[1].trim() } };
  }
  return first;
}

export function callIndex(text: string, tags: CallTag[]): number {
  return findCall(text, tags)?.index ?? -1;
}

function isCallPrefix(after: string, tag: CallTag): boolean {
  const close = `</${tag}>`;
  if (after.includes("\n") || after.includes(close) || after.length > CALL_MAX_CHARS[tag] + close.length) return false;
  if (tag === "tool_call") return after === "" || after.startsWith("{");
  const lt = after.indexOf("<");
  return lt === -1 || close.startsWith(after.slice(lt));
}

// Where the tail of the text could still turn into a call.
function heldFrom(text: string, tag: CallTag): number {
  const open = `<${tag}>`;
  const at = text.lastIndexOf(open);
  if (at !== -1 && isCallPrefix(text.slice(at + open.length), tag)) return at;
  return text.length - trailingTagPrefixLen(text, open);
}

// Takes the first call out of the stream. The rest of that chunk is dropped, as the client cuts its text there;
// what the client sends after the cut (a closing </reasoning>) passes through.
export function createCallFilter(tags: CallTag[], emit: (token: string) => void, onCall: (call: AnswerCall) => void) {
  let pending = "";
  let called = false;

  const push = (token: string) => {
    if (called) {
      emit(token);
      return;
    }
    pending += token;
    const found = findCall(pending, tags);
    if (found) {
      called = true;
      if (found.index > 0) emit(pending.slice(0, found.index));
      pending = "";
      onCall(found.call);
      return;
    }
    const hold = Math.min(...tags.map((tag) => heldFrom(pending, tag)));
    if (hold > 0) emit(pending.slice(0, hold));
    pending = pending.slice(hold);
  };

  const flush = () => {
    if (pending) emit(pending);
    pending = "";
  };

  return { push, flush };
}
