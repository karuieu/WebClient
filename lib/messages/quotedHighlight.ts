/**
 * Use CSS Custom Highlights instead of mutating React-owned message DOM.   Replaced nodes detach ranges and
 * remove the highlight, while the composed quote remains.
 */

const HIGHLIGHT_NAME = "karui-quoted";

let highlight: Highlight | null = null;

function isSupported(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined"
  );
}

export function markQuoted(range: Range): void {
  if (!isSupported()) return;

  if (!highlight) {
    highlight = new Highlight();
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
  }
  // Clone the range so clearing the current selection cannot alter the retained quote marker.
  highlight.add(range.cloneRange());
}

export function clearQuoted(): void {
  highlight?.clear();
}
