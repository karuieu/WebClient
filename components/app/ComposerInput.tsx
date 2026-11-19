"use client";

import * as React from "react";
import { ARTIFACT_KINDS, artifactMentionKey, type ComposerArtifact, type ComposerSkill } from "./ComposerCommands";
import { skillCommandName } from "@/lib/messages/skillInvocation";
import { mentionText, readMentionClipboard, writeMentionClipboard, type CopiedMention, type CopiedPart } from "@/components/app/mentionClipboard";

export type TokenItem = { kind: "skill"; skill: ComposerSkill } | { kind: "artifact"; artifact: ComposerArtifact };
export type ComposerToken = TokenItem & { at: number };

export type ComposerInputHandle = {
  focus: (at?: number) => void;
  insertToken: (item: TokenItem, start: number, end: number) => void;
  replaceText: (start: number, end: number, text: string) => void;
};

type Caret = { at: number; afterToken: boolean };
type Snapshot = { text: string; tokens: ComposerToken[]; caret: Caret };
type Contents = { text: string; tokens: { id: string; at: number }[] };

function tokenId(item: TokenItem): string {
  return item.kind === "skill" ? `skill:${item.skill.id}` : `artifact:${artifactMentionKey(item.artifact)}`;
}

// Tokens at the same offset may sit in any order, so compare them as a set.
function tokensKey(tokens: { id: string; at: number }[]): string {
  return tokens.map(({ id, at }) => `${at}:${id}`).sort().join("\n");
}

function positions(tokens: ComposerToken[]): { id: string; at: number }[] {
  return tokens.map((token) => ({ id: tokenId(token), at: token.at }));
}

function isToken(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && !!node.dataset.tokenId;
}

function readContents(root: Node): Contents {
  const result: Contents = { text: "", tokens: [] };
  const visit = (node: Node): void => {
    if (isToken(node)) {
      result.tokens.push({ id: node.dataset.tokenId ?? "", at: result.text.length });
    } else if (node.nodeType === Node.TEXT_NODE) {
      result.text += node.textContent;
    } else if (node instanceof HTMLBRElement) {
      // A last <br> only holds the line open, as Chrome adds after a token at the end.
      if (!node.dataset.editorEnd && node.nextSibling) result.text += "\n";
    } else {
      const block = node instanceof HTMLElement && (node.tagName === "DIV" || node.tagName === "P");
      if (block && node.previousSibling && !result.text.endsWith("\n")) result.text += "\n";
      node.childNodes.forEach(visit);
      if (block && node.nextSibling && !result.text.endsWith("\n")) result.text += "\n";
    }
  };
  root.childNodes.forEach(visit);
  return result;
}

function readCaret(root: HTMLElement): Caret {
  const selection = window.getSelection();
  let contents: Contents;
  if (!selection?.focusNode || !root.contains(selection.focusNode)) contents = readContents(root);
  else {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(selection.focusNode, selection.focusOffset);
    contents = readContents(range.cloneContents());
  }
  return { at: contents.text.length, afterToken: contents.tokens.at(-1)?.at === contents.text.length };
}

function placeCaret(root: HTMLElement, caret: Caret): void {
  root.focus({ preventScroll: true });
  let left = caret.at;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  for (const node of root.childNodes) {
    if (isToken(node)) {
      if (left !== 0) continue;
      if (!caret.afterToken) {
        range.setStartBefore(node);
        break;
      }
      range.setStartAfter(node);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (left < length || (left === length && !(node.nextSibling && isToken(node.nextSibling)))) {
        range.setStart(node, left);
        break;
      }
      left -= length;
    }
  }
  range.collapse(true);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function tokenElement(token: ComposerToken, icons: HTMLElement | null): HTMLElement {
  const element = document.createElement("span");
  element.contentEditable = "false";
  element.dataset.tokenId = tokenId(token);
  element.className = "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[4px] bg-link/12 px-1 align-bottom text-link";
  const label = document.createElement("span");
  label.className = "min-w-0 truncate";
  if (token.kind === "artifact") {
    const icon = icons?.querySelector(`[data-kind="${token.artifact.type}"] > svg`)?.cloneNode(true);
    if (icon) element.append(icon);
    label.textContent = token.artifact.title;
  } else {
    label.textContent = skillCommandName(token.skill.name);
  }
  element.append(label);
  return element;
}

function copiedOf(token: ComposerToken): CopiedMention {
  if (token.kind === "skill") return { kind: "skill", id: token.skill.id, source: token.skill.source, label: skillCommandName(token.skill.name) };
  const { chatId, path, title, type } = token.artifact;
  return { kind: "artifact", chatId, path, title, type };
}

function writeContents(root: HTMLElement, text: string, tokens: ComposerToken[], icons: HTMLElement | null): void {
  const fragment = document.createDocumentFragment();
  let from = 0;
  for (const token of tokens) {
    fragment.append(document.createTextNode(text.slice(from, token.at)), tokenElement(token, icons));
    from = token.at;
  }
  fragment.append(document.createTextNode(text.slice(from)));
  if (text.endsWith("\n")) {
    const end = document.createElement("br");
    end.dataset.editorEnd = "true";
    fragment.append(end);
  }
  root.replaceChildren(fragment);
}

// A token glued to the next word or token would read as part of it, so a space follows every token.
function spaceAfterTokens(snapshot: Snapshot): Snapshot {
  let { text, tokens, caret } = snapshot;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const at = tokens[i].at;
    if (tokens[i + 1]?.at !== at && (!text[at] || /\s/.test(text[at]))) continue;
    text = text.slice(0, at) + " " + text.slice(at);
    tokens = tokens.map((token, j) => (j > i ? { ...token, at: token.at + 1 } : token));
    if (caret.at > at || (caret.at === at && caret.afterToken)) caret = { ...caret, at: caret.at + 1 };
  }
  return { text, tokens, caret };
}

export function ComposerInput({
  ref,
  value,
  tokens,
  onChange,
  onCaretChange,
  onFocus,
  onKeyDown,
  onPaste,
  resolveMention,
  autoFocus,
  placeholder,
  ...accessibility
}: React.AriaAttributes & {
  ref: React.Ref<ComposerInputHandle>;
  value: string;
  tokens: ComposerToken[];
  onChange: (text: string, tokens: ComposerToken[]) => void;
  onCaretChange: (at: number) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLElement>) => void;
  resolveMention?: (mention: CopiedMention) => TokenItem | null;
  autoFocus?: boolean;
  placeholder: string;
}): React.JSX.Element {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const iconsRef = React.useRef<HTMLSpanElement>(null);
  const current = React.useRef<Snapshot>({ text: value, tokens, caret: { at: value.length, afterToken: tokens.length > 0 } });
  const history = React.useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const composition = React.useRef<Snapshot | null>(null);
  const pendingCaret = React.useRef<Caret | null>(null);

  const commit = (next: Snapshot, record = true): void => {
    const change = composition.current ? next : spaceAfterTokens(next);
    if (change.text !== next.text) pendingCaret.current = change.caret;
    if (record && !composition.current && (change.text !== current.current.text || tokensKey(positions(change.tokens)) !== tokensKey(positions(current.current.tokens)))) {
      history.current.past.push(current.current);
      history.current.future = [];
    }
    current.current = change;
    onCaretChange(change.caret.at);
    onChange(change.text, change.tokens);
  };

  const readInput = (): void => {
    const root = rootRef.current;
    if (!root) return;
    const contents = readContents(root);
    const known = new Map(current.current.tokens.map((token) => [tokenId(token), token]));
    commit({
      text: contents.text,
      tokens: contents.tokens.flatMap(({ id, at }) => {
        const token = known.get(id);
        return token ? [{ ...token, at }] : [];
      }),
      caret: readCaret(root),
    });
  };

  const insertText = (text: string): void => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount || !selection.focusNode || !root.contains(selection.focusNode)) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    readInput();
  };

  const copySelection = (event: React.ClipboardEvent<HTMLElement>, cut: boolean): void => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const contents = readContents(selection.getRangeAt(0).cloneContents());
    if (contents.tokens.length === 0) return;
    const known = new Map(current.current.tokens.map((token) => [tokenId(token), token]));
    const parts: CopiedPart[] = [];
    let from = 0;
    for (const { id, at } of contents.tokens) {
      const token = known.get(id);
      if (!token) continue;
      parts.push(contents.text.slice(from, at), copiedOf(token));
      from = at;
    }
    parts.push(contents.text.slice(from));
    const { text, html } = writeMentionClipboard(parts);
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
    event.clipboardData.setData("text/html", html);
    if (cut) insertText("");
  };

  // A mention the composer can't resolve, or one already in the message, is pasted as its text.
  const insertParts = (parts: CopiedPart[]): void => {
    insertText("");
    const { text, tokens, caret } = current.current;
    const added: ComposerToken[] = [];
    let inserted = "";
    const taken = (item: TokenItem): boolean => item.kind === "skill"
      ? added.some((token) => token.kind === "skill")
      : [...tokens, ...added].some((token) => tokenId(token) === tokenId(item));
    for (const part of parts) {
      const item = typeof part === "string" ? null : resolveMention?.(part) ?? null;
      if (typeof part === "string") inserted += part;
      else if (!item || taken(item)) inserted += mentionText(part);
      else added.push({ ...item, at: caret.at + inserted.length });
    }
    const kept = added.some((token) => token.kind === "skill") ? tokens.filter((token) => token.kind !== "skill") : tokens;
    const before = kept.filter((token) => token.at < caret.at || (token.at === caret.at && caret.afterToken));
    const after = kept.filter((token) => !before.includes(token)).map((token) => ({ ...token, at: token.at + inserted.length }));
    const end = caret.at + inserted.length;
    const next = { at: end, afterToken: added.at(-1)?.at === end };
    pendingCaret.current = next;
    commit({ text: text.slice(0, caret.at) + inserted + text.slice(caret.at), tokens: [...before, ...added, ...after], caret: next });
  };

  const restoreHistory = (direction: "undo" | "redo"): void => {
    const from = direction === "redo" ? history.current.future : history.current.past;
    const to = direction === "redo" ? history.current.past : history.current.future;
    const next = from.pop();
    if (!next) return;
    to.push(current.current);
    pendingCaret.current = next.caret;
    commit(next, false);
  };

  const removeToken = (token: ComposerToken): void => {
    const caret = { at: token.at, afterToken: false };
    pendingCaret.current = caret;
    commit({ text: current.current.text, tokens: current.current.tokens.filter((other) => other !== token), caret });
  };

  React.useImperativeHandle(ref, () => ({
    focus: (at) => {
      const root = rootRef.current;
      if (root) placeCaret(root, at === undefined ? current.current.caret : { at, afterToken: current.current.tokens.some((token) => token.at <= at) });
    },
    insertToken: (item, start, end) => {
      const { text, tokens } = current.current;
      const suffix = text.slice(end);
      const separator = suffix.startsWith(" ") && !tokens.some((token) => token.at === end) ? "" : " ";
      const shift = separator.length - (end - start);
      const kept = tokens
        .filter((token) => !(item.kind === "skill" && token.kind === "skill") && (token.at <= start || token.at >= end))
        .map((token) => (token.at > start ? { ...token, at: token.at + shift } : token));
      const caret = { at: start + 1, afterToken: false };
      pendingCaret.current = caret;
      commit({
        text: text.slice(0, start) + separator + suffix,
        tokens: [...kept.filter((token) => token.at <= start), { ...item, at: start }, ...kept.filter((token) => token.at > start)],
        caret,
      });
    },
    replaceText: (start, end, text) => {
      const tokens = current.current.tokens.flatMap((token) => {
        if (end <= token.at && !(start === end && end === token.at)) return [{ ...token, at: token.at + text.length - (end - start) }];
        if (start < token.at && end > token.at) return [];
        return [token];
      });
      const at = start + text.length;
      const caret = { at, afterToken: tokens.some((token) => at > token.at || (start === end && start === token.at)) };
      pendingCaret.current = caret;
      commit({ text: current.current.text.slice(0, start) + text + current.current.text.slice(end), tokens, caret });
    },
  }));

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const contents = readContents(root);
    const key = tokensKey(positions(tokens));
    if (value !== current.current.text || key !== tokensKey(positions(current.current.tokens))) {
      history.current = { past: [], future: [] };
      current.current = { text: value, tokens, caret: { at: value.length, afterToken: tokens.length > 0 } };
    }
    if (contents.text !== value || tokensKey(contents.tokens) !== key) writeContents(root, value, tokens, iconsRef.current);
    const end = root.querySelector("br[data-editor-end]");
    if (value.endsWith("\n") && !end) {
      const line = document.createElement("br");
      line.dataset.editorEnd = "true";
      root.append(line);
    } else if (!value.endsWith("\n")) end?.remove();
    if (pendingCaret.current !== null) {
      placeCaret(root, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (root && autoFocus) placeCaret(root, current.current.caret);
  }, [autoFocus]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const beforeInput = (event: InputEvent): void => {
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        insertText("\n");
      } else if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
        event.preventDefault();
        restoreHistory(event.inputType === "historyRedo" ? "redo" : "undo");
      } else if (event.inputType.startsWith("format")) event.preventDefault();
    };
    root.addEventListener("beforeinput", beforeInput);
    return () => root.removeEventListener("beforeinput", beforeInput);
  });

  const updateCaret = (): void => {
    const root = rootRef.current;
    if (!root) return;
    const caret = readCaret(root);
    current.current = { ...current.current, caret };
    onCaretChange(caret.at);
  };

  return (
    <>
      <div
        {...accessibility}
        id="composer-input"
        ref={rootRef}
        role="textbox"
        tabIndex={0}
        contentEditable
        spellCheck
        data-focus="within"
        data-empty={!value && !tokens.length ? "true" : undefined}
        data-placeholder={placeholder}
        aria-multiline="true"
        aria-placeholder={placeholder}
        onInput={readInput}
        onCompositionStart={() => { composition.current = current.current; }}
        onCompositionEnd={() => {
          const before = composition.current;
          composition.current = null;
          if (before) current.current = before;
          readInput();
        }}
        onFocus={onFocus}
        onClick={updateCaret}
        onKeyUp={updateCaret}
        onMouseUp={updateCaret}
        onCopy={(event) => copySelection(event, false)}
        onCut={(event) => copySelection(event, true)}
        onPaste={(event) => {
          onPaste?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          const html = event.clipboardData.getData("text/html");
          const parts = html ? readMentionClipboard(html) : null;
          if (parts) insertParts(parts);
          else insertText(event.clipboardData.getData("text/plain"));
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
            event.preventDefault();
            restoreHistory(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
            return;
          }
          if (rootRef.current && window.getSelection()?.isCollapsed && (event.key === "Backspace" || event.key === "Delete")) {
            const caret = readCaret(rootRef.current);
            const atCaret = current.current.tokens.filter((token) => token.at === caret.at);
            const token = event.key === "Backspace" ? caret.afterToken && atCaret.at(-1) : !caret.afterToken && atCaret[0];
            if (token) {
              event.preventDefault();
              removeToken(token);
              return;
            }
          }
          onKeyDown(event);
        }}
        className="max-h-[40vh] min-h-[3.5rem] overflow-y-auto whitespace-pre-wrap break-words px-5 pb-2 pt-4 text-[1.0625rem] leading-relaxed tracking-[-0.01em] text-fg outline-none [overflow-wrap:anywhere] data-[empty=true]:not-focus-within:before:pointer-events-none data-[empty=true]:not-focus-within:before:text-muted data-[empty=true]:not-focus-within:before:content-[attr(data-placeholder)]"
      />
      <span ref={iconsRef} hidden>
        {Object.entries(ARTIFACT_KINDS).map(([type, { icon: Icon }]) => (
          <span key={type} data-kind={type}>
            <Icon className="size-[0.9em]" />
          </span>
        ))}
      </span>
    </>
  );
}
