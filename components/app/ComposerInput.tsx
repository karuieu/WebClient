"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { menuStyles } from "@/components/kit/menuStyles";
import {
  composerCodeBlocks, composerCodeExit, composerFenceEdit, composerLanguage, composerLanguageEdit, type ComposerCodeBlock, type ComposerEdit,
} from "@/lib/ui/composerCode";
import { composerLinks } from "@/lib/ui/composerLinks";
import type { WebLink } from "@/lib/ui/webLinks";
import { cx } from "@/lib/ui/cx";
import { skillCommandName } from "@/lib/messages/skillInvocation";
import type { ComposerSkill, SelectedSkill } from "./ComposerCommands";

export type ComposerInputHandle = {
  focus: (at?: number) => void;
  insertSkill: (skill: ComposerSkill, start: number, end: number) => void;
  replaceText: (start: number, end: number, text: string) => void;
};

type Caret = { at: number; afterToken: boolean };
type Snapshot = { text: string; selected: SelectedSkill | null; caret: Caret };
type Contents = { text: string; tokenId: string | null; tokenAt: number; codeBlocks: ComposerCodeBlock[]; links: WebLink[] };

function closingFence(block: HTMLElement, hasBody: boolean): string {
  const closing = block.dataset.codeClose ?? "";
  return hasBody && closing && !closing.startsWith("\n") ? "\n" + closing : closing;
}

function readContents(root: Node, partialCodeBlock = false): Contents {
  const result: Contents = { text: "", tokenId: null, tokenAt: 0, codeBlocks: [], links: [] };
  const visit = (node: Node): void => {
    if (node instanceof HTMLElement && node.dataset.skillId) {
      result.tokenId = node.dataset.skillId;
      result.tokenAt = result.text.length;
    } else if (node instanceof HTMLElement && node.dataset.codeOpen !== undefined) {
      const start = result.text.length;
      result.text += node.dataset.codeOpen;
      const bodyStart = result.text.length;
      node.childNodes.forEach(visit);
      const bodyEnd = result.text.length;
      const complete = !partialCodeBlock || node !== root.lastChild;
      if (complete) result.text += closingFence(node, bodyEnd > bodyStart);
      result.codeBlocks.push({ start, bodyStart, bodyEnd, end: result.text.length });
      if (complete && node.hasAttribute("data-code-separator")) result.text += "\n";
    } else if (node instanceof HTMLAnchorElement && node.dataset.draftLink !== undefined) {
      const start = result.text.length;
      node.childNodes.forEach(visit);
      result.links.push({ start, end: result.text.length, href: node.getAttribute("href") ?? "" });
    } else if (node.nodeType === Node.TEXT_NODE) {
      result.text += node.textContent;
    } else if (node instanceof HTMLBRElement) {
      const next = node.nextSibling;
      if (!node.dataset.editorEnd && next && !(next instanceof HTMLBRElement && next.dataset.editorEnd)) result.text += "\n";
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
  if (!selection?.focusNode || !root.contains(selection.focusNode)) {
    const contents = readContents(root);
    return { at: contents.text.length, afterToken: !!contents.tokenId };
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(selection.focusNode, selection.focusOffset);
  const focus = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode.parentElement;
  const prefix = readContents(range.cloneContents(), !!focus?.closest("[data-code-open]"));
  return { at: prefix.text.length, afterToken: !!prefix.tokenId };
}

function codeAtCaret(root: HTMLElement): { selection: Selection; element: HTMLElement } | undefined {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.focusNode || !root.contains(selection.focusNode)) return;
  const focus = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode.parentElement;
  const element = focus?.closest<HTMLElement>("pre[data-code-open]");
  return element ? { selection, element } : undefined;
}

function atCodeEdge(selection: Selection, element: HTMLElement, down: boolean): boolean {
  if (!element.textContent) return true;
  const caret = selection.getRangeAt(0).getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(element);
  const rows = [...range.getClientRects()];
  const edge = down ? rows.at(-1) : rows[0];
  return !!edge && caret.height > 0 && Math.abs(caret.top - edge.top) <= 1;
}

function placeTextCaret(range: Range, element: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (offset <= length) {
      range.setStart(node, offset);
      return;
    }
    offset -= length;
  }
  range.selectNodeContents(element);
  range.collapse(false);
}

function placeCaret(root: HTMLElement, caret: Caret): void {
  root.focus({ preventScroll: true });
  let left = caret.at;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  for (const node of root.childNodes) {
    if (node instanceof HTMLElement && node.dataset.skillId) {
      if (left === 0) {
        if (caret.afterToken) range.setStartAfter(node);
        else range.setStartBefore(node);
        break;
      }
    } else if (node instanceof HTMLElement && node.dataset.codeOpen !== undefined) {
      const opening = node.dataset.codeOpen.length;
      const bodyEnd = opening + readContents(node).text.length;
      if (left < opening) {
        range.setStartBefore(node);
        break;
      }
      if (left <= bodyEnd) {
        placeTextCaret(range, node, left - opening);
        break;
      }
      left -= bodyEnd + closingFence(node, bodyEnd > opening).length;
      if (node.hasAttribute("data-code-separator")) left--;
      if (left < 0) {
        range.setStartAfter(node);
        break;
      }
    } else if (node instanceof HTMLAnchorElement && node.dataset.draftLink !== undefined) {
      const length = node.textContent.length;
      if (left <= length) {
        placeTextCaret(range, node, left);
        break;
      }
      left -= length;
    } else if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (left < length || (left === length && !(node.nextSibling instanceof HTMLElement && node.nextSibling.dataset.skillId))) {
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

function writeContents(
  root: HTMLElement, text: string, selected: SelectedSkill | null, descriptionId: string,
  blocks: ComposerCodeBlock[], links: WebLink[],
): void {
  const fragment = document.createDocumentFragment();
  let token: HTMLSpanElement | undefined;
  if (selected) {
    token = document.createElement("span");
    token.contentEditable = "false";
    token.dataset.skillId = selected.skill.id;
    token.tabIndex = 0;
    token.setAttribute("role", "button");
    token.setAttribute("aria-label", `Skill ${skillCommandName(selected.skill.name)}`);
    token.setAttribute("aria-describedby", descriptionId);
    token.className = "inline-block max-w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] bg-link/12 px-1 align-bottom text-link";
    token.textContent = skillCommandName(selected.skill.name);
  }

  let nextLink = 0;
  const appendRange = (parent: DocumentFragment | HTMLElement, from: number, to: number): void => {
    if (parent instanceof DocumentFragment) {
      for (let link = links[nextLink]; link && link.start < to; link = links[++nextLink]) {
        parent.append(document.createTextNode(text.slice(from, link.start)));
        const anchor = document.createElement("a");
        anchor.dataset.draftLink = "";
        anchor.href = link.href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.tabIndex = 0;
        anchor.className = "cursor-pointer text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link";
        anchor.textContent = text.slice(link.start, link.end);
        parent.append(anchor);
        from = link.end;
      }
    }
    parent.append(document.createTextNode(text.slice(from, to)));
  };

  const appendText = (parent: DocumentFragment | HTMLElement, from: number, to: number): void => {
    if (token && selected && selected.at >= from && selected.at <= to) {
      appendRange(parent, from, selected.at);
      parent.append(token);
      appendRange(parent, selected.at, to);
      token = undefined;
    } else {
      appendRange(parent, from, to);
    }
  };

  let position = 0;
  for (const { start, bodyStart, bodyEnd, end } of blocks) {
    appendText(fragment, position, start);
    const block = document.createElement("pre");
    block.dataset.codeOpen = text.slice(start, bodyStart);
    block.dataset.codeClose = text.slice(bodyEnd, end);
    block.spellcheck = false;
    block.className = "my-2 min-h-9 whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm leading-relaxed tracking-normal [overflow-wrap:anywhere] data-[code-language]:before:mb-1 data-[code-language]:before:block data-[code-language]:before:select-none data-[code-language]:before:text-xs data-[code-language]:before:text-muted data-[code-language]:before:content-[attr(data-code-language)]";
    appendText(block, bodyStart, bodyEnd);
    fragment.append(block);
    position = end;
    if (text[position] === "\n") {
      block.dataset.codeSeparator = "";
      position++;
    }
  }
  appendText(fragment, position, text.length);
  root.replaceChildren(fragment);
}

function replaceText(snapshot: Snapshot, start: number, end: number, insert: string, at = start + insert.length): Snapshot {
  let selected = snapshot.selected;
  if (selected && end <= selected.at && !(start === end && end === selected.at)) selected = { ...selected, at: selected.at + insert.length - (end - start) };
  else if (selected && start < selected.at && end > selected.at) selected = null;
  return {
    text: snapshot.text.slice(0, start) + insert + snapshot.text.slice(end),
    selected,
    caret: { at, afterToken: !!selected && (at > selected.at || (start === end && start === selected.at)) },
  };
}

export function ComposerInput({
  ref,
  value,
  selected,
  onChange,
  onCaretChange,
  onFocus,
  onKeyDown,
  onPaste,
  autoFocus,
  placeholder,
  ...accessibility
}: React.AriaAttributes & {
  ref: React.Ref<ComposerInputHandle>;
  value: string;
  selected: SelectedSkill | null;
  onChange: (text: string, selected: SelectedSkill | null) => void;
  onCaretChange: (at: number) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLElement>) => void;
  autoFocus?: boolean;
  placeholder: string;
}): React.JSX.Element {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const current = React.useRef<Snapshot>({ text: value, selected, caret: { at: value.length, afterToken: !!selected } });
  const history = React.useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const composition = React.useRef<Snapshot | null>(null);
  const pendingCaret = React.useRef<Caret | null>(null);
  const [card, setCard] = React.useState<{ left: number; bottom: number } | null>(null);
  const descriptionId = React.useId();

  const commit = (next: Snapshot, record = true): void => {
    let change = next;
    const at = next.selected?.at;
    if (!composition.current && at !== undefined && next.text[at] && !/\s/.test(next.text[at])) {
      const caret = {
        ...next.caret,
        at: next.caret.at + (next.caret.at > at || (next.caret.at === at && next.caret.afterToken) ? 1 : 0),
      };
      change = { ...next, text: next.text.slice(0, at) + " " + next.text.slice(at), caret };
      pendingCaret.current = caret;
    }
    if (record && !composition.current && (change.text !== current.current.text || change.selected?.skill.id !== current.current.selected?.skill.id || change.selected?.at !== current.current.selected?.at)) {
      history.current.past.push(current.current);
      history.current.future = [];
    }
    current.current = change;
    setCard(null);
    onCaretChange(change.caret.at);
    onChange(change.text, change.selected);
  };

  const applyEdit = (edit: ComposerEdit, snapshot = current.current): void => {
    const next = replaceText(snapshot, edit.start, edit.end, edit.insert, edit.caretAt);
    pendingCaret.current = next.caret;
    commit(next);
  };

  const deleteLineAfterCode = (root: HTMLElement): boolean => {
    if (!window.getSelection()?.isCollapsed || codeAtCaret(root)) return false;
    const { at } = readCaret(root);
    const { text } = current.current;
    if (text[at - 1] !== "\n") return false;
    let firstBreak = at - 1;
    while (text[firstBreak - 1] === "\n") firstBreak--;
    const block = composerCodeBlocks(text).find(({ end }) => end === firstBreak);
    if (!block) return false;
    if (at > block.end + 1) {
      applyEdit({ start: at - 1, end: at, insert: "", caretAt: at - 1 });
    } else if (at === text.length) {
      applyEdit({ start: at - 1, end: at, insert: "", caretAt: block.bodyEnd });
    } else {
      const caret = { at: block.bodyEnd, afterToken: !!selected && selected.at <= block.bodyEnd };
      placeCaret(root, caret);
      current.current = { ...current.current, caret };
      onCaretChange(caret.at);
    }
    return true;
  };

  const readInput = (typedFence = false): void => {
    const root = rootRef.current;
    if (!root) return;
    const contents = readContents(root);
    const skill = current.current.selected?.skill;
    const snapshot: Snapshot = {
      text: contents.text,
      selected: skill && contents.tokenId === skill.id ? { skill, at: contents.tokenAt } : null,
      caret: readCaret(root),
    };
    const edit = typedFence && !composition.current && composerFenceEdit(contents.text, snapshot.caret.at, contents.codeBlocks);
    if (edit) applyEdit(edit, snapshot);
    else commit(snapshot);
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

  const restoreHistory = (direction: "undo" | "redo"): void => {
    const from = direction === "redo" ? history.current.future : history.current.past;
    const to = direction === "redo" ? history.current.past : history.current.future;
    const next = from.pop();
    if (!next) return;
    to.push(current.current);
    pendingCaret.current = next.caret;
    commit(next, false);
  };

  const removeSkill = (): void => {
    const selected = current.current.selected;
    if (!selected) return;
    const caret = { at: selected.at, afterToken: false };
    pendingCaret.current = caret;
    commit({ text: current.current.text, selected: null, caret });
  };

  React.useImperativeHandle(ref, () => ({
    focus: (at) => {
      const root = rootRef.current;
      if (root) placeCaret(root, at === undefined ? current.current.caret : { at, afterToken: !!selected && at >= selected.at });
    },
    insertSkill: (skill, start, end) => {
      const suffix = value.slice(end);
      const separator = suffix.startsWith(" ") ? "" : " ";
      const caret = { at: start + 1, afterToken: true };
      pendingCaret.current = caret;
      commit({ text: value.slice(0, start) + separator + suffix, selected: { skill, at: start }, caret });
    },
    replaceText: (start, end, text) => {
      const next = replaceText(current.current, start, end, text);
      pendingCaret.current = next.caret;
      commit(next);
    },
  }));

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const contents = readContents(root);
    if (value !== current.current.text || selected?.skill.id !== current.current.selected?.skill.id || selected?.at !== current.current.selected?.at) {
      history.current = { past: [], future: [] };
      current.current = { text: value, selected, caret: { at: value.length, afterToken: !!selected } };
    }
    const blocks = composerCodeBlocks(value);
    const links = composerLinks(value, blocks, selected?.at);
    const sameBlocks = blocks.length === contents.codeBlocks.length && blocks.every(({ start, bodyStart, bodyEnd, end }, index) => {
      const rendered = contents.codeBlocks[index];
      return start === rendered.start && bodyStart === rendered.bodyStart && bodyEnd === rendered.bodyEnd && end === rendered.end;
    });
    const sameLinks = links.length === contents.links.length && links.every(({ start, end, href }, index) => {
      const rendered = contents.links[index];
      return start === rendered.start && end === rendered.end && href === rendered.href;
    });
    if (contents.text !== value || contents.tokenId !== (selected?.skill.id ?? null) || (selected && contents.tokenAt !== selected.at) || !sameBlocks || (!composition.current && !sameLinks)) {
      const focused = root.contains(document.activeElement);
      writeContents(root, value, selected, descriptionId, blocks, links);
      if (focused && !pendingCaret.current) pendingCaret.current = current.current.caret;
    }
    const addTrailingLine = (parent: HTMLElement, needed: boolean): void => {
      const marker = parent.querySelector(":scope > br[data-editor-end]");
      if (marker && marker !== parent.lastChild) marker.remove();
      const last = parent.lastChild;
      if (last instanceof HTMLBRElement) {
        if (needed) last.dataset.editorEnd = "true";
        else last.remove();
      } else if (needed) {
        const line = document.createElement("br");
        line.dataset.editorEnd = "true";
        parent.append(line);
      }
    };
    addTrailingLine(root, value.endsWith("\n") && blocks.at(-1)?.end !== value.length);
    for (const block of root.querySelectorAll<HTMLElement>("pre[data-code-open]")) {
      const body = readContents(block).text;
      const language = composerLanguage(block.dataset.codeOpen ?? "", body);
      if (language) block.dataset.codeLanguage = language;
      else delete block.dataset.codeLanguage;
      addTrailingLine(block, !body || body.endsWith("\n"));
    }
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
    if (typeof Highlight === "undefined" || !CSS.highlights) return;
    const blocks = [...(rootRef.current?.querySelectorAll<HTMLElement>("pre[data-code-language]") ?? [])];
    if (!blocks.length) return;

    let cancelled = false;
    let clear: (() => void) | undefined;
    import("@/lib/ui/composerSyntax").then(({ highlightComposerCode }) => {
      if (!cancelled) clear = highlightComposerCode(blocks);
    });
    return () => {
      cancelled = true;
      clear?.();
    };
  }, [value, selected?.at, selected?.skill.id]);

  React.useEffect(() => {
    if (!card) return;
    const close = (): void => setCard(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [card]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const beforeInput = (event: InputEvent): void => {
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        insertText("\n");
      } else if (event.inputType === "deleteContentBackward" && deleteLineAfterCode(root)) {
        event.preventDefault();
      } else if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
        event.preventDefault();
        restoreHistory(event.inputType === "historyRedo" ? "redo" : "undo");
      } else if (event.inputType.startsWith("format")) event.preventDefault();
    };
    root.addEventListener("beforeinput", beforeInput);
    return () => root.removeEventListener("beforeinput", beforeInput);
  });

  const showCard = (target: EventTarget): void => {
    if (!(target instanceof HTMLElement)) return;
    const token = target.closest<HTMLElement>("[data-skill-id]");
    if (!token) return;
    const rect = token.getBoundingClientRect();
    setCard({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 200)), bottom: window.innerHeight - rect.top + 8 });
  };

  const updateCaret = (): void => {
    const root = rootRef.current;
    if (!root) return;
    const caret = readCaret(root);
    current.current = { ...current.current, caret };
    onCaretChange(caret.at);
  };

  const handleCodeKey = (event: React.KeyboardEvent<HTMLElement>): void => {
    const root = rootRef.current;
    if (!root || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter") return;
    const focus = codeAtCaret(root);
    if (!focus) return;
    const at = readCaret(root).at;
    const blocks = composerCodeBlocks(value);
    const block = blocks.find(({ bodyStart, bodyEnd }) => at >= bodyStart && at <= bodyEnd);
    if (!block) return;
    let edit: ComposerEdit | undefined;
    if (key === "Enter") {
      edit = composerLanguageEdit(value, block, at);
    } else {
      const down = key === "ArrowDown";
      if (at === (down ? block.bodyEnd : block.bodyStart) || atCodeEdge(focus.selection, focus.element, down)) {
        edit = composerCodeExit(value, block, down);
      }
    }
    if (edit) {
      event.preventDefault();
      applyEdit(edit);
    }
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
        data-empty={!value && !selected ? "true" : undefined}
        data-placeholder={placeholder}
        aria-multiline="true"
        aria-placeholder={placeholder}
        onInput={(event) => readInput(event.nativeEvent instanceof InputEvent && event.nativeEvent.inputType === "insertText" && !!event.nativeEvent.data?.endsWith("`"))}
        onCompositionStart={() => { composition.current = current.current; }}
        onCompositionEnd={() => {
          const before = composition.current;
          composition.current = null;
          if (before) current.current = before;
          readInput();
        }}
        onFocus={(event) => { onFocus(); showCard(event.target); }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setCard(null); }}
        onPointerOver={(event) => showCard(event.target)}
        onPointerOut={(event) => {
          if (!(event.relatedTarget instanceof HTMLElement) || !event.relatedTarget.closest("[data-skill-id]")) setCard(null);
        }}
        onClick={(event) => {
          if (event.target instanceof Element) {
            const link = event.target.closest<HTMLAnchorElement>("a[data-draft-link]");
            if (link) {
              event.preventDefault();
              if (window.getSelection()?.isCollapsed) window.open(link.href, "_blank", "noopener,noreferrer");
            }
          }
          updateCaret();
          showCard(event.target);
        }}
        onKeyUp={updateCaret}
        onMouseUp={updateCaret}
        onPaste={(event) => {
          onPaste?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          insertText(event.clipboardData.getData("text/plain"));
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" && event.target instanceof HTMLAnchorElement && event.target.dataset.draftLink !== undefined) {
            event.preventDefault();
            window.open(event.target.href, "_blank", "noopener,noreferrer");
            return;
          }
          if (event.key === "Escape" && card) {
            event.preventDefault();
            event.stopPropagation();
            setCard(null);
            if (rootRef.current) placeCaret(rootRef.current, current.current.caret);
            return;
          }
          if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
            event.preventDefault();
            restoreHistory(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
            return;
          }
          if (event.key === "Backspace" && rootRef.current && window.getSelection()?.isCollapsed) {
            const at = readCaret(rootRef.current).at;
            const block = composerCodeBlocks(value).find(({ bodyStart }) => bodyStart === at);
            if (block) {
              event.preventDefault();
              const body = value.slice(block.bodyStart, block.bodyEnd);
              const next = replaceText(current.current, block.start, block.end, body, block.start);
              pendingCaret.current = next.caret;
              commit(next);
              return;
            }
          }
          if (selected && rootRef.current && window.getSelection()?.isCollapsed && (event.key === "Backspace" || event.key === "Delete")) {
            const caret = readCaret(rootRef.current);
            if (caret.at === selected.at && (event.key === "Backspace" ? caret.afterToken : !caret.afterToken)) {
              event.preventDefault();
              removeSkill();
              return;
            }
          }
          if (event.target instanceof HTMLElement && event.target.dataset.skillId && selected) {
            if (event.key === "Backspace" || event.key === "Delete") {
              event.preventDefault();
              removeSkill();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setCard(null);
              if (rootRef.current) placeCaret(rootRef.current, { at: selected.at, afterToken: true });
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              showCard(event.target);
            }
            return;
          }
          handleCodeKey(event);
          if (!event.defaultPrevented) onKeyDown(event);
        }}
        className="max-h-[40vh] min-h-[3.5rem] overflow-y-auto whitespace-pre-wrap break-words px-5 pb-2 pt-4 text-[1.0625rem] leading-relaxed tracking-[-0.01em] text-fg outline-none [overflow-wrap:anywhere] data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted data-[empty=true]:before:content-[attr(data-placeholder)]"
      />
      {selected && <span id={descriptionId} hidden>{selected.skill.description} Press Backspace to remove.</span>}
      {card && selected && createPortal(
        <div role="tooltip" style={card} className={cx(menuStyles.panel, "pointer-events-none fixed z-[100] w-48 p-2")}>
          <p className="line-clamp-5 rounded-lg bg-surface px-2 py-2 text-[12px] leading-[17px] text-muted">{selected.skill.description}</p>
          <p className="px-0.5 pb-0.5 pt-2 text-[12px] text-muted">Skill</p>
        </div>, document.body,
      )}
    </>
  );
}
