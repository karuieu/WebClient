
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

// GLM sometimes writes the tag while thinking, too; only the block outside <reasoning> counts.
function indexOutsideReasoning(text: string, tag: string, inReasoning: boolean): number {
  for (let at = text.indexOf(tag); at !== -1; at = text.indexOf(tag, at + 1)) {
    if (!reasoningAt(text, at, inReasoning)) return at;
  }
  return -1;
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
  let inReasoning = false;
  let tagTail = "";
  const forward = (text: string): void => {
    const seen = tagTail + text;
    inReasoning = reasoningAt(seen, seen.length, inReasoning);
    tagTail = seen.slice(-"</reasoning>".length);
    emit(text);
  };

  const push = (token: string) => {
    if (done) {
      emit(token);
      return;
    }
    pending += token;

    const openIdx = indexOutsideReasoning(pending, open, inReasoning);
    if (openIdx === -1) {
      const hold = trailingTagPrefixLen(pending, open);
      const out = pending.slice(0, pending.length - hold);
      pending = pending.slice(pending.length - hold);
      if (out) forward(out);
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
      if (out) forward(out);
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

function withoutFirstBlock(text: string, open: string, close: string): string {
  const start = indexOutsideReasoning(text, open, false);
  const end = start === -1 ? -1 : text.indexOf(close, start + open.length);
  return end === -1 ? text : text.slice(0, start) + text.slice(end + close.length);
}

export function stripTitleBlock(response: string): string {
  return withoutFirstBlock(withoutFirstBlock(response, TITLE_OPEN, TITLE_CLOSE), BRIEF_OPEN, BRIEF_CLOSE).trimStart();
}

export function stripMemoryNotes(text: string): string {
  return text.replace(/<memory_note>[\s\S]*?<\/memory_note>/g, "");
}

export type CallTag = "search_query" | "fetch_url" | "read" | "connector_call";

// Why a connector call was rejected before it could be read.
export type CallProblem = "not_json" | "unfinished" | "too_long";

export interface AnswerCall {
  tag: CallTag;
  value: string;
  problem?: CallProblem;
}

const QUERY_MAX_CHARS = 200;
const URL_MAX_CHARS = 2048;
const TOOL_CALL_MAX_CHARS = 16000;

// A call is a single line between the tags. Anything else is the model talking about the tag, often in its reasoning.
const CALL_VALUE: Record<CallTag, string> = {
  search_query: `[^<\\n]{1,${QUERY_MAX_CHARS}}`,
  fetch_url: ` *https?://[^\\s<]{1,${URL_MAX_CHARS}} *`,
  read: `[^<\\n]{1,${QUERY_MAX_CHARS}}`,
  // Connector calls are JSON, which may span lines and whose strings may contain "<".
  connector_call: `\\{[\\s\\S]{0,${TOOL_CALL_MAX_CHARS}}?\\}`,
};

const CALL_MAX_CHARS: Record<CallTag, number> = {
  search_query: QUERY_MAX_CHARS,
  fetch_url: URL_MAX_CHARS + 10,
  read: QUERY_MAX_CHARS,
  connector_call: TOOL_CALL_MAX_CHARS + 2,
};

// GLM sometimes wraps a call in its own native tag and drops the call tag's "<": <tool_call>search_query>…</search_query>.
const WRAPPER = "<tool_call>";
const CONNECTOR_OPEN = "<connector_call>";
// The longest wrapped call: a page address with two wrappers and its tags.
const WRAPPED_MAX_CHARS = CALL_MAX_CHARS.fetch_url + 64;
// GLM's native <tool_call> also opens a connector call: JSON in it is the older Karui format and Qwen's native one.
// It can also repeat the connector tag without "<" before emitting native arguments.
const CONNECTOR_OPENERS = "(?:<(?:connector|tool)_call>\\s*)+(?:connector_call>\\s*)?";
const CONNECTOR_CLOSE = "\\s*</(?:connector|tool)_call>";
// An opening tag at the end, possibly with the start of a tool name.
const CONNECTOR_OPENER_TAIL = new RegExp(`${CONNECTOR_OPENERS}(?:c\\d*)?$`);

function reasoningAt(text: string, index: number, initial: boolean): boolean {
  const before = text.slice(0, index);
  const open = before.lastIndexOf("<reasoning>");
  const close = before.lastIndexOf("</reasoning>");
  return open === -1 && close === -1 ? initial : open > close;
}

// While the streamed text ends inside <reasoning>, when that block opened; the previous value carries it across tokens.
export function thinkingSince(text: string, since: number | null): number | null {
  if (!reasoningAt(text, text.length, false)) return null;
  return since ?? Date.now();
}

function connectorAttempt(text: string, inReasoning = false): RegExpExecArray | null {
  const pattern = new RegExp(`${CONNECTOR_OPENERS}(\\{|\\[|c\\d+_)`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (!reasoningAt(text, match.index, inReasoning)) return match;
  }
  return null;
}

// How much of the end is the start of a connector tag. Only Stop drops a bare "<"; otherwise it has to be more than ordinary text would be.
function connectorTagTail(text: string, stopped = false): number {
  return Math.max(...[[CONNECTOR_OPEN, "<connector_"], [WRAPPER, "<tool_"]].map(([tag, distinct]) => {
    const n = trailingTagPrefixLen(text, tag);
    return n >= (stopped ? 1 : distinct.length) ? n : 0;
  }));
}

export function stripToolCalls(text: string): string {
  const complete = new RegExp(`${CONNECTOR_OPENERS}${CALL_VALUE.connector_call}${CONNECTOR_CLOSE}`, "g");
  const stripped = text.replace(complete, "")
    .replace(new RegExp(`${CONNECTOR_OPENERS}(?=\\{|\\[|c\\d+_|c\\d*$|$)[\\s\\S]*?(?:</(?:connector|tool)_call>|$)`, "g"), "")
    .replace(/<\/(?:connector|tool)_call>/g, "");
  return stripped.slice(0, stripped.length - connectorTagTail(stripped));
}

function callOpen(tag: CallTag): string {
  return tag === "connector_call" ? CONNECTOR_OPENERS : `(?:(?:${WRAPPER}\\s*)+<?|<)${tag}>`;
}

function callClose(tag: CallTag): string {
  return tag === "connector_call" ? CONNECTOR_CLOSE : `</${tag}>`;
}

function findCall(text: string, tags: CallTag[], inReasoning = false): { index: number; call: AnswerCall } | null {
  let first: { index: number; call: AnswerCall } | null = null;
  for (const tag of tags) {
    const match = new RegExp(`${callOpen(tag)}(${CALL_VALUE[tag]})${callClose(tag)}`).exec(text);
    if (match && (!first || match.index < first.index)) first = { index: match.index, call: { tag, value: match[1].trim() } };
  }
  const attempt = tags.includes("connector_call") ? connectorAttempt(text, inReasoning) : null;
  if (attempt && (!first || attempt.index < first.index)) {
    const bodyLength = text.length - (attempt.index + attempt[0].length - 1);
    const problem = attempt[1] !== "{" ? "not_json" : bodyLength > CALL_MAX_CHARS.connector_call + "</connector_call>".length ? "too_long" : null;
    // A closing tag can be part of a JSON string. Keep an unfinished object hidden until it resolves or the stream ends.
    return problem ? { index: attempt.index, call: { tag: "connector_call", value: "", problem } } : null;
  }
  return first;
}

export function callIndex(text: string, tags: CallTag[]): number {
  return findCall(text, tags)?.index ?? -1;
}

function isCallPrefix(after: string, tag: CallTag): boolean {
  const close = `</${tag}>`;
  if (after.includes("\n") || after.includes(close) || after.length > CALL_MAX_CHARS[tag] + close.length) return false;
  const lt = after.indexOf("<");
  return lt === -1 || close.startsWith(after.slice(lt));
}

// Where the tail of the text could still turn into a call.
function heldFrom(text: string, tag: CallTag, inReasoning: boolean): number {
  if (tag === "connector_call") {
    const attempt = connectorAttempt(text, inReasoning);
    if (attempt) return attempt.index;
    // The JSON may start on the next line.
    const opener = CONNECTOR_OPENER_TAIL.exec(text);
    return opener ? opener.index : text.length - trailingTagPrefixLen(text, CONNECTOR_OPEN);
  }
  const open = `<${tag}>`;
  const at = text.lastIndexOf(open);
  if (at !== -1 && isCallPrefix(text.slice(at + open.length), tag)) return at;
  return text.length - trailingTagPrefixLen(text, open);
}

// A wrapped call, or a connector tag in reasoning, can't be told apart from a mention until its line ends, so the line is held from the tag on.
function wrapperHeldFrom(text: string): number {
  const line = text.slice(text.lastIndexOf("\n") + 1);
  const at = line.search(/<(?:tool|connector)_call>/);
  if (at !== -1 && line.length - at <= WRAPPED_MAX_CHARS) return text.length - line.length + at;
  return text.length - Math.max(trailingTagPrefixLen(text, WRAPPER), trailingTagPrefixLen(text, CONNECTOR_OPEN));
}

// Takes the first call out of the stream. The rest of that chunk is dropped, as the client cuts its text there;
// what the client sends after the cut (a closing </reasoning>) passes through.
export function createCallFilter(tags: CallTag[], emit: (token: string) => void, onCall: (call: AnswerCall) => void) {
  let pending = "";
  let called = false;
  let inReasoning = false;
  let tagTail = "";
  const forward = (token: string): void => {
    const text = tagTail + token;
    inReasoning = reasoningAt(text, text.length, inReasoning);
    tagTail = text.slice(-"</reasoning>".length);
    emit(token);
  };

  const push = (token: string) => {
    if (called) {
      forward(token);
      return;
    }
    // Providers close their reasoning channel separately, even after an unfinished call.
    if (token === "</reasoning>" && connectorAttempt(pending)) {
      pending = "";
      forward(token);
      return;
    }
    pending += token;
    const found = findCall(pending, tags, inReasoning);
    if (found) {
      called = true;
      if (found.index > 0) forward(pending.slice(0, found.index));
      pending = "";
      onCall(found.call);
      return;
    }
    const hold = Math.min(...tags.map((tag) => heldFrom(pending, tag, inReasoning)), wrapperHeldFrom(pending));
    if (hold > 0) forward(pending.slice(0, hold));
    pending = pending.slice(hold);
  };

  const flush = (stopped = false) => {
    const connector = tags.includes("connector_call");
    const attempt = connector ? connectorAttempt(pending, inReasoning) : null;
    const opener = connector ? CONNECTOR_OPENER_TAIL.exec(pending) : null;
    const tail = connector ? connectorTagTail(pending, stopped) : 0;
    if (attempt || opener || tail > 0) {
      const index = attempt?.index ?? opener?.index ?? pending.length - tail;
      if (index > 0) forward(pending.slice(0, index));
      if (!stopped && !inReasoning) onCall({ tag: "connector_call", value: "", problem: "unfinished" });
    } else if (pending) forward(pending);
    pending = "";
  };

  return { push, flush };
}
