"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { menuStyles } from "@/components/kit/menuStyles";
import { cx } from "@/lib/ui/cx";
import type { ComposerSkill, SelectedSkill } from "./ComposerCommands";
import { skillCommandName } from "@/lib/messages/skillInvocation";

export type SkillComposerInputHandle = {
  focus: (at?: number) => void;
  insertSkill: (skill: ComposerSkill, start: number, end: number) => void;
  replaceText: (start: number, end: number, text: string) => void;
};

type Caret = { at: number; afterToken: boolean };
type Snapshot = { text: string; selected: SelectedSkill | null; caret: Caret };
type Contents = { text: string; tokenId: string | null; tokenAt: number };

function readContents(root: Node): Contents {
  const result: Contents = { text: "", tokenId: null, tokenAt: 0 };
  const visit = (node: Node): void => {
    if (node instanceof HTMLElement && node.dataset.skillId) {
      result.tokenId = node.dataset.skillId;
      result.tokenAt = result.text.length;
    } else if (node.nodeType === Node.TEXT_NODE) {
      result.text += node.textContent;
    } else if (node instanceof HTMLBRElement) {
      if (!node.dataset.editorEnd && (node.previousSibling || node.nextSibling)) result.text += "\n";
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
  const prefix = readContents(range.cloneContents());
  return { at: prefix.text.length, afterToken: !!prefix.tokenId };
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

function writeContents(root: HTMLElement, text: string, selected: SelectedSkill | null, descriptionId: string): void {
  const fragment = document.createDocumentFragment();
  if (selected) {
    fragment.append(document.createTextNode(text.slice(0, selected.at)));
    const token = document.createElement("span");
    token.contentEditable = "false";
    token.dataset.skillId = selected.skill.id;
    token.tabIndex = 0;
    token.setAttribute("role", "button");
    token.setAttribute("aria-label", `Skill ${skillCommandName(selected.skill.name)}`);
    token.setAttribute("aria-describedby", descriptionId);
    token.className = "inline-block max-w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] bg-link/12 px-1 align-bottom text-link";
    token.textContent = skillCommandName(selected.skill.name);
    fragment.append(token, document.createTextNode(text.slice(selected.at)));
  } else {
    fragment.append(document.createTextNode(text));
  }
  if (text.endsWith("\n")) {
    const end = document.createElement("br");
    end.dataset.editorEnd = "true";
    fragment.append(end);
  }
  root.replaceChildren(fragment);
}

export function SkillComposerInput({
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
  ref: React.Ref<SkillComposerInputHandle>;
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

  const readInput = (): void => {
    const root = rootRef.current;
    if (!root) return;
    const contents = readContents(root);
    const skill = current.current.selected?.skill;
    commit({
      text: contents.text,
      selected: skill && contents.tokenId === skill.id ? { skill, at: contents.tokenAt } : null,
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
      let nextSelected = current.current.selected;
      if (nextSelected && end <= nextSelected.at && !(start === end && end === nextSelected.at)) nextSelected = { ...nextSelected, at: nextSelected.at + text.length - (end - start) };
      else if (nextSelected && start < nextSelected.at && end > nextSelected.at) nextSelected = null;
      const at = start + text.length;
      const caret = { at, afterToken: !!nextSelected && (at > nextSelected.at || (start === end && start === nextSelected.at)) };
      pendingCaret.current = caret;
      commit({ text: value.slice(0, start) + text + value.slice(end), selected: nextSelected, caret });
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
    if (contents.text !== value || contents.tokenId !== (selected?.skill.id ?? null) || (selected && contents.tokenAt !== selected.at)) writeContents(root, value, selected, descriptionId);
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
        onInput={readInput}
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
        onClick={(event) => { updateCaret(); showCard(event.target); }}
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
          onKeyDown(event);
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
