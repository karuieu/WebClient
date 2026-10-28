
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { accountSettingKey } from "@/lib/account/session";
import { remarkSubSup } from "@/lib/ui/remarkSubSup";

const STORAGE_KEY = "karui_artifacts";
const DEFAULT = true;

export function getArtifactsEnabled(): boolean {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(accountSettingKey(STORAGE_KEY));
    if (raw === null) return DEFAULT;
    return raw === "1";
  } catch {
    return DEFAULT;
  }
}

export function setArtifactsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(accountSettingKey(STORAGE_KEY), enabled ? "1" : "0");
  } catch {}
}

/** A note is Markdown; a document is HTML. */
export type ArtifactType = "markdown" | "html";

const SAVED = ["created", "updated", "edited", "failed"] as const;
export type SavedAs = (typeof SAVED)[number];

export interface Artifact {
  title: string;
  type: ArtifactType;
  content: string;
  /** `mode="edit"`: `content` holds <old>/<new> pairs for a Library file, not a document. */
  edit?: boolean;
  /** Written into the tag when a project chat's answer is saved to the Library, like the three below. */
  path?: string;
  saved?: SavedAs;
  /** Why a change to a Library file didn't happen. */
  reason?: string;
  changes?: number;
  streaming?: boolean;
}

export function artifactTypeOf(path: string): ArtifactType | null {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  return null;
}

const DEFAULT_TITLE = "Document";
const ARTIFACT_BLOCK = /<artifact\b([^>]*)>([\s\S]*?)<\/artifact>/g;
const OPEN_TAG = "<artifact";

export function tagAttr(raw: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(raw);
  if (!match) return "";
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function fromTag(rawAttrs: string, content: string): Artifact {
  const saved = SAVED.find((s) => s === tagAttr(rawAttrs, "saved"));
  return {
    title: tagAttr(rawAttrs, "title") || DEFAULT_TITLE,
    // Blocks without a type predate notes and are HTML.
    type: tagAttr(rawAttrs, "type").toLowerCase() === "markdown" ? "markdown" : "html",
    content,
    edit: tagAttr(rawAttrs, "mode").toLowerCase() === "edit" || undefined,
    path: tagAttr(rawAttrs, "path") || undefined,
    saved,
    reason: tagAttr(rawAttrs, "reason") || undefined,
    changes: Number(tagAttr(rawAttrs, "changes")) || undefined,
  };
}

export type EditPair = { old: string; new: string };

export function editPairs(content: string): EditPair[] {
  return [...content.matchAll(/<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>/g)].map((m) => ({ old: m[1], new: m[2] }));
}

// Models put the tags on lines of their own, so a pair is also tried without those line breaks.
function withoutEdgeBreaks(pair: EditPair): EditPair {
  return { old: pair.old.replace(/^\n|\n$/g, ""), new: pair.new.replace(/^\n|\n$/g, "") };
}

const occurrences = (text: string, part: string) => text.split(part).length - 1;

/** All pairs or none: each `old` must appear exactly once. Null when one doesn't fit. */
export function applyEdits(text: string, pairs: EditPair[]): string | null {
  if (pairs.length === 0) return null;
  let out = text;
  for (const pair of pairs) {
    const fit = [pair, withoutEdgeBreaks(pair)].find((p) => p.old && occurrences(out, p.old) === 1);
    if (!fit) return null;
    out = out.replace(fit.old, () => fit.new);
  }
  return out;
}

export function parseArtifacts(content: string): { artifacts: Artifact[]; text: string } {
  const artifacts: Artifact[] = [];

  let text = content.replace(ARTIFACT_BLOCK, (_, rawAttrs: string, inner: string) => {
    artifacts.push(fromTag(rawAttrs, inner.trim()));
    return "";
  });

  const openIdx = text.indexOf(OPEN_TAG);
  if (openIdx !== -1) {
    const rest = text.slice(openIdx);
    const gt = rest.indexOf(">");
    // Even an incomplete opening tag must be hidden before its title is known.
    const rawAttrs = gt === -1 ? "" : rest.slice(OPEN_TAG.length, gt);
    const inner = gt === -1 ? "" : rest.slice(gt + 1);
    artifacts.push({ ...fromTag(rawAttrs, inner), streaming: true });
    text = text.slice(0, openIdx);
  }

  return { artifacts, text: text.trim() };
}

/** Attributes for the closed blocks, in order; `null` leaves one as it is. */
export function setArtifactAttrs(content: string, attrs: (Record<string, string> | null)[]): string {
  let index = 0;
  return content.replace(ARTIFACT_BLOCK, (block, rawAttrs: string, inner: string) => {
    const set = attrs[index++];
    if (!set) return block;
    let next = rawAttrs;
    for (const [name, value] of Object.entries(set)) {
      const attr = `${name}="${escapeHtml(value)}"`;
      const existing = new RegExp(`\\s${name}\\s*=\\s*"[^"]*"`, "i");
      next = existing.test(next) ? next.replace(existing, ` ${attr}`) : `${next} ${attr}`;
    }
    return `<artifact${next}>${inner}</artifact>`;
  });
}

const FRAGMENT_STYLES = `
  :root { color-scheme: light; }
  body {
    max-width: 680px; margin: 0 auto; padding: 40px 32px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; line-height: 1.65; color: #1a1a1a; background: #ffffff;
  }
  h1, h2, h3 { line-height: 1.25; letter-spacing: -0.01em; }
  h1 { font-size: 1.75em; margin: 0 0 0.6em; }
  h2 { font-size: 1.25em; margin: 1.6em 0 0.5em; }
  h3 { font-size: 1.05em; margin: 1.4em 0 0.4em; }
  p, ul, ol, table, pre, blockquote { margin: 0 0 1em; }
  li { margin: 0.25em 0; }
  .contains-task-list { list-style: none; padding-left: 0.25em; }
  .task-list-item input { margin: 0 0.5em 0 0; }
  a { color: inherit; }
  img, table { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; font-size: 0.95em; }
  th, td { border-bottom: 1px solid #e5e5ea; padding: 8px 12px 8px 0; text-align: left; vertical-align: top; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #f2f2f4; border-radius: 4px; padding: 0.1em 0.3em; }
  pre { background: #f5f5f7; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #e5e5ea; color: #555; }
  hr { border: 0; border-top: 1px solid #e5e5ea; margin: 2em 0; }
  @media (max-width: 640px) { body { padding: 20px 16px; font-size: 16px; } table { display: block; overflow-x: auto; } }
  @media print { body { max-width: none; padding: 0; } }
`;

const VIEWPORT_META = `<meta name="viewport" content="width=device-width, initial-scale=1">`;

// Append narrow-screen overflow rules after model styles so long URLs, tables, and code do not overflow phones.
const MOBILE_GUARD_STYLES = `
  @media (max-width: 640px) {
    html, body { max-width: 100%; overflow-x: hidden; }
    body { overflow-wrap: break-word; word-break: break-word; }
    img, svg, video, canvas, iframe { max-width: 100%; height: auto; }
    table, pre { max-width: 100%; overflow-x: auto; display: block; }
  }
`;

/**
 * Remove active content as defense in depth; regexes are not a complete HTML sanitizer.   Preview
 * sandboxing and the downloaded document's CSP enforce script restrictions.
 */
export function stripActiveContent(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/((?:href|src|action|formaction|xlink:href)\s*=\s*["']?)\s*javascript:[^"'>\s]*/gi, "$1#");
}

const NO_SCRIPTS_CSP =
  `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`;

/** Raw HTML in a note stays text, except <sub>/<sup>: a note can't carry markup of its own. */
function markdownToHtml(markdown: string): string {
  return renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm, remarkSubSup] }, markdown));
}

function bodyHtml(artifact: Pick<Artifact, "type" | "content">): string {
  return stripActiveContent(artifact.type === "markdown" ? markdownToHtml(artifact.content) : artifact.content);
}

export function toDocument(artifact: Pick<Artifact, "title" | "type" | "content">): string {
  const html = bodyHtml(artifact);

  if (!/<html[\s>]/i.test(html)) {
    return (
      `<!doctype html><html><head>${NO_SCRIPTS_CSP}<meta charset="utf-8">${VIEWPORT_META}` +
      `<title>${escapeHtml(artifact.title)}</title>` +
      `<style>${FRAGMENT_STYLES}</style></head><body>${html}</body></html>`
    );
  }

  const injection =
    (/<meta[^>]+name\s*=\s*["']?viewport/i.test(html) ? "" : VIEWPORT_META) +
    `<style>${MOBILE_GUARD_STYLES}</style>`;

  return withLeadingCsp(withHeadInjection(html, injection));
}

function withHeadInjection(html: string, injection: string): string {
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, injection + "</head>");
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (tag) => tag + injection);
  }
  return injection + html;
}

/** Put CSP immediately after the doctype: it only governs content parsed after the meta tag. */
function withLeadingCsp(html: string): string {
  return `<!doctype html>${NO_SCRIPTS_CSP}${html.replace(/^\s*<!doctype[^>]*>/i, "")}`;
}

export function titleSlug(title: string): string {
  return title
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
}

function fileName(title: string, extension: string): string {
  return `${titleSlug(title) || "document"}.${extension}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke only after the click — Firefox aborts the download if the URL
  // disappears in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadArtifactMarkdown(artifact: Artifact): void {
  downloadBlob(new Blob([artifact.content], { type: "text/markdown;charset=utf-8" }), fileName(artifact.title, "md"));
}

export function downloadArtifact(artifact: Artifact): void {
  if (artifact.type === "markdown") downloadArtifactMarkdown(artifact);
  else downloadArtifactHtml(artifact);
}

export function downloadArtifactHtml(artifact: Artifact): void {
  downloadBlob(
    new Blob([toDocument(artifact)], { type: "text/html;charset=utf-8" }),
    fileName(artifact.title, "html")
  );
}

export function downloadArtifactDoc(artifact: Artifact): void {
  const wrapped =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head>${NO_SCRIPTS_CSP}<meta charset="utf-8"><title>${escapeHtml(artifact.title)}</title></head>` +
    `<body>${bodyHtml(artifact)}</body></html>`;
  downloadBlob(
    new Blob([wrapped], { type: "application/msword;charset=utf-8" }),
    fileName(artifact.title, "doc")
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
