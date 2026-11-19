import { refractor } from "refractor";
import jsx from "refractor/jsx";
import tsx from "refractor/tsx";

refractor.register(jsx);
refractor.register(tsx);

const grammarNames = new Map([
  ["c++", "cpp"],
  ["c#", "csharp"],
  ["shell", "bash"],
]);

const palette = new Map([
  ["keyword", "keyword"], ["important", "keyword"], ["atrule", "keyword"], ["tag", "keyword"],
  ["string", "string"], ["char", "string"], ["attr-value", "string"], ["regex", "string"], ["url", "string"],
  ["number", "number"], ["boolean", "number"], ["constant", "number"],
  ["function", "function"], ["property", "function"], ["attr-name", "function"],
  ["builtin", "type"], ["class-name", "type"],
  ["comment", "comment"], ["prolog", "comment"], ["doctype", "comment"], ["cdata", "comment"],
]);

type SyntaxNode = ReturnType<typeof refractor.highlight>["children"][number];

function tokenRanges(code: string, grammar: string): { start: number; end: number; color: string }[] {
  const ranges: { start: number; end: number; color: string }[] = [];
  let offset = 0;
  const visit = (node: SyntaxNode, inherited?: string): void => {
    if (node.type === "text") {
      const end = offset + node.value.length;
      if (inherited && end > offset) ranges.push({ start: offset, end, color: inherited });
      offset = end;
    } else if (node.type === "element") {
      const classes = node.properties.className;
      const color = Array.isArray(classes) ? classes.map((name) => palette.get(String(name))).find(Boolean) : undefined;
      for (const child of node.children) visit(child, color ?? inherited);
    }
  };
  for (const node of refractor.highlight(code, grammar).children) visit(node);
  return ranges;
}

export function highlightComposerCode(blocks: readonly HTMLElement[]): () => void {
  const registry = CSS.highlights;
  const applied: { key: string; range: Range }[] = [];
  for (const block of blocks) {
    const language = block.dataset.codeLanguage?.toLowerCase();
    if (!language || !block.textContent) continue;
    const grammar = grammarNames.get(language) ?? language;
    if (!refractor.registered(grammar)) continue;

    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let offset = 0;
    const point = (at: number): { node: Text; offset: number } | undefined => {
      while (node instanceof Text) {
        if (at <= offset + node.length) return { node, offset: at - offset };
        offset += node.length;
        node = walker.nextNode();
      }
      return undefined;
    };

    for (const { start, end, color } of tokenRanges(block.textContent, grammar)) {
      const first = point(start);
      const last = point(end);
      if (!first || !last) break;
      const range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset);
      const key = "karui-composer-" + color;
      let highlight = registry.get(key);
      if (!highlight) {
        highlight = new Highlight();
        registry.set(key, highlight);
      }
      highlight.add(range);
      applied.push({ key, range });
    }
  }

  return () => {
    for (const { key, range } of applied) {
      const highlight = registry.get(key);
      if (!highlight) continue;
      highlight.delete(range);
      if (highlight.size === 0) registry.delete(key);
    }
  };
}
