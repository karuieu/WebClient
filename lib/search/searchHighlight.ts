/**
 * Marks search terms in an opened chat with a CSS Custom Highlight, like
 * quotedHighlight, so React-owned message DOM stays untouched. A match split
 * across elements (half of a word in bold) isn't marked.
 */

import { findRanges, fold } from "./searchText";

const HIGHLIGHT_NAME = "karui-search";

function isSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
}

export function markSearchTerms(root: Element, terms: string[]): Range | null {
  if (!isSupported()) return null;
  const highlight = new Highlight();
  let first: Range | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const [start, end] of findRanges(fold(node.nodeValue ?? ""), terms)) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      highlight.add(range);
      first ??= range;
    }
  }
  CSS.highlights.set(HIGHLIGHT_NAME, highlight);
  return first;
}

export function clearSearchTerms(): void {
  if (isSupported()) CSS.highlights.delete(HIGHLIGHT_NAME);
}
