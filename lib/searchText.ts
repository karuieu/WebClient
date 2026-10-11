/**
 * Text matching for the search palette. Everything runs on decrypted text in
 * memory; nothing here touches the network or storage.
 */

import { parseArtifacts } from "./artifacts";
import { parseSkillDrafts } from "./skills";
import { parseQuestions } from "./questions";
import { parseMessageBlocks, splitQuote } from "./messageBlocks";
import { parseMessageContent } from "./vision";

export type TextRange = readonly [number, number];
export type MarkedText = { text: string; ranges: TextRange[] };

// Letters NFD doesn't split into a base letter and a mark.
const SPECIAL: Record<string, string> = { ł: "l", Ł: "l", ø: "o", Ø: "o", đ: "d", Đ: "d", ß: "s", æ: "a", Æ: "a", œ: "o", Œ: "o", ı: "i" };

export function fold(text: string): string {
  const out = new Array<string>(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    out[i] = c < "\u0080" ? c.toLowerCase() : (SPECIAL[c] ?? c.normalize("NFD")[0].toLowerCase()[0]);
  }
  return out.join("");
}

export function searchTerms(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
}

export function matchesAll(folded: string, terms: string[]): boolean {
  return terms.length > 0 && terms.every((t) => folded.includes(t));
}

export function findRanges(folded: string, terms: string[], limit = 50): TextRange[] {
  const spans: [number, number][] = [];
  for (const t of terms) {
    for (let i = folded.indexOf(t); i >= 0 && spans.length < limit; i = folded.indexOf(t, i + t.length)) spans.push([i, i + t.length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push(s);
  }
  return merged;
}

export function marked(text: string, terms: string[]): MarkedText {
  return { text, ranges: findRanges(fold(text), terms) };
}

const CONTEXT = 40;
const WINDOW = 200;

export function snippet(text: string, terms: string[], folded = fold(text)): MarkedText {
  const hits = terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0);
  const first = hits.length ? Math.min(...hits) : 0;
  let start = Math.max(0, first - CONTEXT);
  const space = text.slice(start, first).search(/\s/);
  if (start > 0 && space >= 0) start += space + 1;
  const end = Math.min(text.length, start + WINDOW);
  const clean = text
    .slice(start, end)
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~|`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return marked((start > 0 ? "…" : "") + clean + (end < text.length ? "…" : ""), terms);
}

export function messageSearchText(role: "user" | "assistant", content: string): string {
  if (role === "user") {
    const parsed = parseMessageContent(content);
    return [splitQuote(parsed.text).text, ...parsed.files.map((f) => f.name)].filter(Boolean).join("\n");
  }
  const { artifacts, text } = parseArtifacts(content);
  const { drafts, text: withoutDrafts } = parseSkillDrafts(parseMessageBlocks(text).answer);
  const { questions, text: answer } = parseQuestions(withoutDrafts);
  return [answer, ...artifacts.map((a) => a.title), ...drafts.map((d) => d.name), ...questions.map((q) => q.question)]
    .filter(Boolean)
    .join("\n");
}
