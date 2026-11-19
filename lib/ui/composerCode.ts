import { detectCodeLanguage, knownCodeLanguage } from "@/lib/ui/codeLanguages";

export type ComposerCodeBlock = {
  start: number;
  bodyStart: number;
  bodyEnd: number;
  end: number;
};

export type ComposerEdit = { start: number; end: number; insert: string; caretAt: number };

export function composerLanguage(opening: string, code: string): string | undefined {
  const explicit = /^`{3,}[ \t]*([^\s`]+)/.exec(opening)?.[1];
  return explicit ? knownCodeLanguage(explicit) ?? explicit : detectCodeLanguage(code);
}

export function composerLanguageEdit(text: string, block: ComposerCodeBlock, at: number): ComposerEdit | undefined {
  if (at !== block.bodyEnd) return;
  const openingEnd = block.bodyStart - 1;
  const language = text.slice(block.bodyStart, block.bodyEnd);
  if (!knownCodeLanguage(language) || !/^`{3,}$/.test(text.slice(block.start, openingEnd))) return;
  return { start: openingEnd, end: block.bodyEnd, insert: language + "\n", caretAt: openingEnd + language.length + 1 };
}

export function composerCodeExit(text: string, block: ComposerCodeBlock, down: boolean): ComposerEdit {
  if (!down) {
    const before = block.start - 1;
    if (before === 0 || (before > 0 && text[before - 1] === "\n")) {
      return { start: before, end: before, insert: "", caretAt: before };
    }
    return { start: block.start, end: block.start, insert: "\n", caretAt: block.start };
  }

  const after = text.slice(block.end);
  const fence = /^`{3,}/.exec(text.slice(block.start, block.bodyStart))?.[0] ?? "```";
  const closing = block.bodyEnd === block.end ? "\n" + fence : "";
  const separator = after === "\n" || after.startsWith("\n\n") ? "" : "\n";
  return { start: block.end, end: block.end, insert: closing + separator, caretAt: block.end + closing.length + 1 };
}

export function composerCodeBlocks(text: string): ComposerCodeBlock[] {
  const blocks: ComposerCodeBlock[] = [];
  let opening: { start: number; bodyStart: number; fenceLength: number } | undefined;
  for (const { index, 0: line, 1: fence, 2: info } of text.matchAll(/^(`{3,})([^\n`]*)$/gm)) {
    const end = index + line.length;
    if (opening) {
      if (fence.length < opening.fenceLength || info.trim()) continue;
      const { start, bodyStart } = opening;
      blocks.push({ start, bodyStart, bodyEnd: Math.max(bodyStart, index - 1), end });
      opening = undefined;
    } else if (text[end] === "\n") {
      opening = { start: index, bodyStart: end + 1, fenceLength: fence.length };
    }
  }
  if (opening) {
    const { start, bodyStart } = opening;
    blocks.push({ start, bodyStart, bodyEnd: text.length, end: text.length });
  }
  return blocks;
}

export function composerHasText(text: string, blocks: ComposerCodeBlock[]): boolean {
  let offset = 0;
  for (const { start, bodyStart, bodyEnd, end } of blocks) {
    if (text.slice(offset, start).trim() || text.slice(bodyStart, bodyEnd).trim()) return true;
    offset = end;
  }
  return text.slice(offset).trim().length > 0;
}

export function composerFenceEdit(
  text: string,
  at: number,
  blocks: ComposerCodeBlock[],
): ComposerEdit | undefined {
  const fence = "```";
  if (at < fence.length) return;
  const lineStart = text.lastIndexOf("\n", at - fence.length - 1) + 1;
  if (text.slice(lineStart, at) !== fence) return;

  const block = blocks.find(({ bodyStart, bodyEnd }) => at >= bodyStart && at <= bodyEnd);
  if (block) {
    if (at !== block.bodyEnd) return;
    const start = Math.max(block.bodyStart, lineStart - 1);
    const closing = text.slice(block.bodyEnd, block.end) || "\n" + fence;
    const separator = text[block.end] === "\n" ? "" : "\n";
    return { start, end: block.end, insert: closing + separator, caretAt: start + closing.length + 1 };
  }
  if (at === text.length || text[at] === "\n") {
    return { start: at, end: at, insert: "\n\n" + fence, caretAt: at + 1 };
  }
  return undefined;
}
