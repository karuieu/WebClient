import type { ComposerCodeBlock, ComposerEdit } from "@/lib/ui/composerCode";

export type ComposerListItem = { start: number; markerStart: number; markerEnd: number; end: number };

type Marker = { indent: string; bullet?: string; number?: string; delimiter?: string; space: string; task: boolean };

const markerPattern = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;

function parseMarker(line: string): (Marker & { length: number }) | undefined {
  const match = markerPattern.exec(line);
  if (!match) return;
  const [whole, indent, bullet, number, delimiter, space, task] = match;
  return { indent, bullet, number, delimiter, space, task: !!task, length: whole.length };
}

function lineEnd(text: string, from: number): number {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
}

export function composerListItems(text: string, blocks: ComposerCodeBlock[], tokenAt?: number): ComposerListItem[] {
  const items: ComposerListItem[] = [];
  let blockIndex = 0;
  for (let start = 0; start <= text.length; start = lineEnd(text, start) + 1) {
    const end = lineEnd(text, start);
    while (blocks[blockIndex] && blocks[blockIndex].end < start) blockIndex++;
    const block = blocks[blockIndex];
    if (block && block.start <= end) continue;
    if (tokenAt !== undefined && tokenAt >= start && tokenAt <= end) continue;
    const marker = parseMarker(text.slice(start, end));
    if (marker) items.push({ start, markerStart: start + marker.indent.length, markerEnd: start + marker.length, end });
  }
  return items;
}

/** The edit for a line break inside a list item: the next item, or the end of the list when the item is empty. */
export function composerListBreak(text: string, at: number, items: ComposerListItem[]): ComposerEdit | undefined {
  const item = items.find(({ markerEnd, end }) => at >= markerEnd && at <= end);
  const marker = item && parseMarker(text.slice(item.start, item.end));
  if (!item || !marker) return;
  if (item.markerEnd === item.end) return { start: item.start, end: item.end, insert: "", caretAt: item.start };

  const ordered = marker.number !== undefined;
  const label = ordered ? `${Number(marker.number) + 1}${marker.delimiter}` : marker.bullet;
  const next = marker.indent + label + marker.space + (marker.task ? "[ ] " : "");

  const moved = at + (/^[ \t]*/.exec(text.slice(at, item.end))?.[0].length ?? 0);
  const following: string[] = [];
  let end = item.end;
  let number = Number(marker.number) + 2;
  let renumbered = false;
  while (ordered && items.some(({ start }) => start === end + 1)) {
    const start = end + 1;
    const line = text.slice(start, lineEnd(text, start));
    const sibling = parseMarker(line);
    if (!sibling || sibling.indent.length < marker.indent.length) break;
    if (sibling.indent === marker.indent) {
      if (sibling.delimiter !== marker.delimiter || sibling.number === undefined) break;
      const label = String(number++);
      renumbered ||= label !== sibling.number;
      following.push(sibling.indent + label + line.slice(sibling.indent.length + sibling.number.length));
    } else {
      following.push(line);
    }
    end = start + line.length;
  }
  const insert = "\n" + next;
  if (!renumbered) return { start: at, end: moved, insert, caretAt: at + insert.length };
  const tail = [text.slice(moved, item.end), ...following].join("\n");
  return { start: at, end, insert: insert + tail, caretAt: at + insert.length };
}

/** Backspace right after a list marker removes the marker and keeps the line's text and indentation. */
export function composerListUnmark(at: number, items: ComposerListItem[]): ComposerEdit | undefined {
  const item = items.find(({ markerEnd }) => markerEnd === at);
  return item && { start: item.markerStart, end: item.markerEnd, insert: "", caretAt: item.markerStart };
}

/**
 * Deleting the newline at `newline` when it starts or ends a list item. The model does it because the browser
 * edits a list item as its own block and does not know which newline it is deleting.
 */
export function composerListJoin(text: string, newline: number, items: ComposerListItem[]): ComposerEdit | undefined {
  if (text[newline] !== "\n" || !items.some(({ start, end }) => end === newline || start === newline + 1)) return;
  return { start: newline, end: newline + 1, insert: "", caretAt: newline };
}
