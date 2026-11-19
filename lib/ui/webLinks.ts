export type WebLink = { start: number; end: number; href: string };

const webAddress = /(?<![\p{L}\p{N}_@./])(https?:\/\/|www\.)([^\s<>"“”‘’`\\]+)/giu;
const trailingPunctuation = /[.,!?;:'…)\]}]/;
const delimiters = [["(", ")"], ["[", "]"], ["{", "}"]];

function trimAddress(text: string): string {
  let tail = text.length;
  while (tail > 0 && trailingPunctuation.test(text[tail - 1])) tail--;
  if (tail === text.length) return text;
  const body = text.slice(0, tail);
  let end = tail;
  for (const [open, close] of delimiters) {
    if (!text.includes(close, tail)) continue;
    const unclosed = body.split(open).length - body.split(close).length;
    let position = tail;
    for (let count = 0; count < unclosed; count++) {
      const index = text.indexOf(close, position);
      if (index < 0) break;
      position = index + 1;
    }
    end = Math.max(end, position);
  }
  return text.slice(0, end);
}

export function* webLinks(text: string): Generator<WebLink> {
  for (const { index: start, 1: prefix, 2: candidate } of text.matchAll(webAddress)) {
    const address = trimAddress(candidate);
    if (!address) continue;
    const label = prefix + address;
    const end = start + label.length;
    const href = prefix.toLowerCase() === "www." ? "https://" + label : label;
    try {
      new URL(href);
    } catch {
      continue;
    }
    yield { start, end, href };
  }
}
