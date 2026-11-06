
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { accountSettingKey } from "@/lib/account/session";
import { remarkRunOnList } from "@/lib/ui/remarkRunOnList";
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

/** A note is Markdown, a document is HTML, and code is a program's source file. */
export type ArtifactType = "markdown" | "html" | "code";

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

/** Code files by extension: the Prism language that colours them and the name people know it by. */
const CODE_LANGUAGES: Record<string, { prism: string; label: string }> = {
  py: { prism: "python", label: "Python" },
  ts: { prism: "typescript", label: "TypeScript" },
  tsx: { prism: "tsx", label: "TSX" },
  js: { prism: "javascript", label: "JavaScript" },
  jsx: { prism: "jsx", label: "JSX" },
  mjs: { prism: "javascript", label: "JavaScript" },
  json: { prism: "json", label: "JSON" },
  yaml: { prism: "yaml", label: "YAML" },
  yml: { prism: "yaml", label: "YAML" },
  toml: { prism: "toml", label: "TOML" },
  sh: { prism: "bash", label: "Shell" },
  go: { prism: "go", label: "Go" },
  rs: { prism: "rust", label: "Rust" },
  java: { prism: "java", label: "Java" },
  kt: { prism: "kotlin", label: "Kotlin" },
  swift: { prism: "swift", label: "Swift" },
  c: { prism: "c", label: "C" },
  h: { prism: "c", label: "C" },
  cpp: { prism: "cpp", label: "C++" },
  cs: { prism: "csharp", label: "C#" },
  rb: { prism: "ruby", label: "Ruby" },
  php: { prism: "php", label: "PHP" },
  sql: { prism: "sql", label: "SQL" },
  css: { prism: "css", label: "CSS" },
  txt: { prism: "text", label: "Plain text" },
};

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

export function artifactTypeOf(path: string): ArtifactType | null {
  const ext = extensionOf(path);
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  return ext in CODE_LANGUAGES ? "code" : null;
}

export type CodeLanguage = { ext: string; prism: string; label: string };

/** Unknown extensions are plain text saved as .txt. */
export function codeLanguageOf(path: string | undefined): CodeLanguage {
  const ext = extensionOf(path ?? "");
  return ext in CODE_LANGUAGES ? { ext, ...CODE_LANGUAGES[ext] } : { ext: "txt", ...CODE_LANGUAGES.txt };
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

// Blocks without a type predate notes and are HTML.
function typeOf(attr: string): ArtifactType {
  const type = attr.toLowerCase();
  return type === "markdown" || type === "code" ? type : "html";
}

// Models wrap code in a Markdown fence out of habit; the fence isn't part of the file.
const CODE_FENCE = /^```[\w+#.-]*[^\S\n]*\n([\s\S]*?)\n?```$/;

function fromTag(rawAttrs: string, content: string): Artifact {
  const saved = SAVED.find((s) => s === tagAttr(rawAttrs, "saved"));
  const type = typeOf(tagAttr(rawAttrs, "type"));
  return {
    title: tagAttr(rawAttrs, "title") || DEFAULT_TITLE,
    type,
    content: type === "code" ? content.replace(CODE_FENCE, "$1") : content,
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

/** What one of an answer's closed artifacts does to a file. `changes` counts the pairs when every block for the file was an edit. */
export type BlockWrite =
  | { kind: "write"; path: string; content: string; existed: boolean; changes?: number }
  | { kind: "merged" }
  | { kind: "failed"; path?: string; reason: string };

export const TEXT_NOT_FOUND = "the text to replace wasn't found";
const SHORTENED = "the note was shortened instead of written out";
const CODE_SHORTENED = "the code was shortened instead of written out";

// A line such as "… full content …", "...rest unchanged..." or "<!-- ... -->" stands for text the model left out.
const PLACEHOLDER_LINE = /^[\s[(<!-]*(?:\.{3}|…)[^.…\n]{0,40}(?:\.{3}|…)?[\s\])>-]*$/m;
// In code a bare "..." is real (Python's Ellipsis, stubs), so only a comment with words after the dots counts:
// "# ... rest unchanged", "// … existing code …", "/* ... */ keep".
const CODE_PLACEHOLDER_LINE = /^\s*(?:#|\/\/|\/\*|--|<!--)\s*(?:\.{3}|…)\s*\p{L}[^\n]{0,60}$/mu;

// A site's stylesheet and script are code: "...state," on its own line is a JavaScript spread, not a gap.
function hasPlaceholder(artifact: Artifact): boolean {
  if (artifact.type === "code") return CODE_PLACEHOLDER_LINE.test(artifact.content);
  const files = artifact.type === "html" ? siteFiles(artifact.content) : null;
  if (!files) return PLACEHOLDER_LINE.test(artifact.content);
  return PLACEHOLDER_LINE.test(files["index.html"]) || CODE_PLACEHOLDER_LINE.test(files["style.css"] + "\n" + files["script.js"]);
}

/** A rewrite of an existing file that leaves its text out: it would wipe the file, so it is refused. */
function isShortened(artifact: Artifact, current: string | undefined): boolean {
  return hasPlaceholder(artifact) && (current === undefined || artifact.content.length < current.length);
}

/**
 * An answer's closed artifacts against the files they name, in order; `files` maps each path to its content when known.
 * Models sometimes send each change to a file as a block of its own, so blocks for one file make a single write at its
 * last block and the earlier ones are `merged`.
 */
export function planWrites(closed: Artifact[], files: ReadonlyMap<string, string | undefined>, missing: string): BlockWrite[] {
  const writes: BlockWrite[] = [];
  const lastWrite = new Map<string, number>();
  const taken = new Set(files.keys());
  for (const artifact of closed) {
    const target = artifact.path ? artifactPath(artifact) : undefined;
    const at = target === undefined ? undefined : lastWrite.get(target);
    const before = at === undefined ? undefined : (writes[at] as Extract<BlockWrite, { kind: "write" }>);
    let write: Extract<BlockWrite, { kind: "write" }>;
    if (artifact.edit) {
      if (target === undefined || (!before && !files.has(target))) {
        writes.push({ kind: "failed", reason: missing });
        continue;
      }
      const pairs = editPairs(artifact.content);
      const base = before ? before.content : files.get(target);
      const edited = base === undefined ? null : applyEdits(base, pairs);
      if (edited === null) {
        writes.push({ kind: "failed", path: target, reason: TEXT_NOT_FOUND });
        continue;
      }
      // A rewrite earlier in the answer makes the whole write a rewrite.
      const changes = !before ? pairs.length : before.changes === undefined ? undefined : before.changes + pairs.length;
      write = { kind: "write", path: target, content: edited, existed: before?.existed ?? true, changes };
    } else {
      const existing = target !== undefined && (before !== undefined || files.has(target));
      if (existing && isShortened(artifact, before ? before.content : files.get(target))) {
        writes.push({ kind: "failed", path: target, reason: artifact.type === "code" ? CODE_SHORTENED : SHORTENED });
        continue;
      }
      const path = existing ? target : libraryPath(artifact, taken);
      write = { kind: "write", path, content: artifact.content, existed: before?.existed ?? files.has(path) };
    }
    if (at !== undefined) writes[at] = { kind: "merged" };
    taken.add(write.path);
    lastWrite.set(write.path, writes.length);
    writes.push(write);
  }
  return writes;
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

/**
 * Attributes for the closed blocks, in order; `null` leaves a block as it is and a `null` value removes that attribute.
 * `bodies` replaces a block's content where it has one, and `null` drops the block.
 */
export function setArtifactAttrs(
  content: string,
  attrs: (Record<string, string | null> | null)[],
  bodies: (string | null | undefined)[] = [],
): string {
  let index = 0;
  return content.replace(ARTIFACT_BLOCK, (block, rawAttrs: string, inner: string) => {
    const body = bodies[index];
    const set = attrs[index++];
    if (body === null) return "";
    if (!set && body === undefined) return block;
    let next = rawAttrs;
    for (const [name, value] of Object.entries(set ?? {})) {
      const existing = new RegExp(`\\s${name}\\s*=\\s*"[^"]*"`, "i");
      if (value === null) next = next.replace(existing, "");
      else if (existing.test(next)) next = next.replace(existing, ` ${name}="${escapeHtml(value)}"`);
      else next = `${next} ${name}="${escapeHtml(value)}"`;
    }
    return `<artifact${next}>${body === undefined ? inner : `\n${body}\n`}</artifact>`;
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
  return renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm, remarkRunOnList, remarkSubSup] }, markdown));
}

function bodyHtml(artifact: Pick<Artifact, "type" | "content">): string {
  return stripActiveContent(artifact.type === "markdown" ? markdownToHtml(artifact.content) : artifact.content);
}

/** A site with a script is one artifact holding these three files, each in a <file name="…"> block. */
export const SITE_FILES = ["index.html", "style.css", "script.js"] as const;
export type SiteFile = (typeof SITE_FILES)[number];
export type SiteFiles = Record<SiteFile, string>;

const FILE_BLOCK = /<file\s+name="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/file>/g;

function isSiteFile(name: string): name is SiteFile {
  return (SITE_FILES as readonly string[]).includes(name);
}

/** The site's files, or null for a site written as one HTML document. */
export function siteFiles(content: string): SiteFiles | null {
  const files: SiteFiles = { "index.html": "", "style.css": "", "script.js": "" };
  let found = false;
  for (const [, name, text] of content.matchAll(FILE_BLOCK)) {
    if (!isSiteFile(name)) continue;
    files[name] = text;
    found = true;
  }
  return found ? files : null;
}

/** The site with one file's text replaced, or added when the model left that file out. */
export function withSiteFile(content: string, name: SiteFile, text: string): string {
  const block = `<file name="${name}">\n${text}\n</file>`;
  let replaced = false;
  const next = content.replace(FILE_BLOCK, (whole: string, n: string) => {
    if (n !== name) return whole;
    replaced = true;
    return block;
  });
  return replaced ? next : `${content}\n${block}`;
}

// WebRTC isn't covered by CSP, so it is the one way out a script would still have. Deleting it raises the bar;
// a determined script can still get it back from a fresh about:blank frame, so this is a hurdle, not a block.
const NO_WEBRTC =
  "for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCIceCandidate', 'RTCSessionDescription']) delete window[name];";

function siteCsp(scriptSrc: string): string {
  return (
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${scriptSrc}; ` +
    `style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; ` +
    `frame-src 'none'; form-action 'none'; base-uri 'none'">`
  );
}

// A file's text can't close the tag it is inlined in.
function inlined(text: string): string {
  return text.replace(/<\/(script|style)/gi, "<\\/$1");
}

function beforeClose(html: string, tag: string, text: string): string {
  const close = new RegExp(`</${tag}\\s*>`, "i");
  return close.test(html) ? html.replace(close, (match) => text + match) : html + text;
}

/**
 * index.html with style.css inlined, and script.js only when `run` is given. Its own scripts, handlers and links are
 * removed, and the CSP lets nothing load or leave. In the app the frame inherits the page's nonce-only CSP, so
 * `nonce` must be the page's; a downloaded file runs without one.
 */
export function composeSite(files: SiteFiles, run?: { nonce?: string }): string {
  const scriptSrc = !run ? "'none'" : run.nonce ? `'nonce-${run.nonce}'` : "'unsafe-inline'";
  const nonce = run?.nonce ? ` nonce="${run.nonce}"` : "";
  const html = stripActiveContent(files["index.html"]).replace(/<link\b[^>]*>/gi, "").replace(/^\s*<!doctype[^>]*>/i, "");
  const head = `<meta charset="utf-8">` + (/<meta[^>]+name\s*=\s*["']?viewport/i.test(html) ? "" : VIEWPORT_META);
  const styles = `<style>${inlined(files["style.css"])}</style><style>${MOBILE_GUARD_STYLES}</style>`;
  const scripts = run ? `<script${nonce}>${NO_WEBRTC}</script><script${nonce}>${inlined(files["script.js"])}</script>` : "";
  // The CSP goes first: it only governs what is parsed after it.
  return `<!doctype html>${siteCsp(scriptSrc)}${head}` + beforeClose(beforeClose(html, "head", styles), "body", scripts);
}

/** Browsers hide a nonce from attributes, but the property keeps it (lib/account/captcha.ts does the same). */
export function pageNonce(): string | undefined {
  return document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || undefined;
}

/** Notes and documents only: code is never shown on paper. A site with a script is shown still, without it. */
export function toDocument(artifact: Pick<Artifact, "title" | "type" | "content">): string {
  const files = artifact.type === "html" ? siteFiles(artifact.content) : null;
  if (files) return composeSite(files);
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

/** Replaces each closed block with what `replace` returns for its place among them; `undefined` keeps it. */
export function replaceArtifactBlocks(content: string, replace: (index: number) => string | undefined): string {
  let index = 0;
  return content.replace(ARTIFACT_BLOCK, (block) => replace(index++) ?? block);
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

const ARTIFACT_EXTENSION = { markdown: "md", html: "html" } as const;

// Code keeps the extension it was given, since that names its language.
function extensionFor(artifact: Pick<Artifact, "type">, name: string | undefined): string {
  return artifact.type === "code" ? codeLanguageOf(name).ext : ARTIFACT_EXTENSION[artifact.type];
}
// Characters file systems refuse, so a downloaded Library keeps its names.
const UNSAFE_PATH_CHARS = /[\\:*?"<>|]/g;

// The model's path cleaned up, with the extension of the artifact's type; the title when it gave none.
function requestedPath(artifact: Pick<Artifact, "title" | "type" | "path">): { base: string; ext: string } {
  const raw = artifact.path ?? "";
  const parts = raw
    .split("/")
    .map((p) => p.replace(UNSAFE_PATH_CHARS, "-").trim())
    .filter((p) => p && p !== "." && p !== "..");
  const last = raw.trimEnd().endsWith("/") ? undefined : parts.pop();
  const name = last?.replace(/\.[^.]+$/, "") || titleSlug(artifact.title) || "untitled";
  return { base: [...parts, name].join("/"), ext: extensionFor(artifact, last) };
}

/** Where the artifact asks to be: its cleaned-up `path`, or its title. */
export function artifactPath(artifact: Pick<Artifact, "title" | "type" | "path">): string {
  const { base, ext } = requestedPath(artifact);
  return `${base}.${ext}`;
}

/** Never an existing file's path: a taken one gets " (2)", " (3)", … */
export function libraryPath(artifact: Pick<Artifact, "title" | "type" | "path">, taken: ReadonlySet<string>): string {
  const { base, ext } = requestedPath(artifact);
  let path = `${base}.${ext}`;
  for (let n = 2; taken.has(path); n++) path = `${base} (${n}).${ext}`;
  return path;
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

/** The file as written: Markdown for a note, the source file under its own name for code. */
export function downloadArtifactSource(artifact: Artifact): void {
  if (artifact.type !== "code") {
    downloadBlob(new Blob([artifact.content], { type: "text/markdown;charset=utf-8" }), fileName(artifact.title, "md"));
    return;
  }
  const name = artifact.path?.split("/").pop();
  const known = name && artifactTypeOf(name) === "code";
  downloadBlob(new Blob([artifact.content], { type: "text/plain;charset=utf-8" }), known ? name : fileName(artifact.title, "txt"));
}

export function downloadArtifact(artifact: Artifact): void {
  if (artifact.type === "html") downloadArtifactHtml(artifact);
  else downloadArtifactSource(artifact);
}

/** A site with a script downloads as one page that runs offline, its files inlined. */
export function downloadArtifactHtml(artifact: Pick<Artifact, "title" | "type" | "content">): void {
  const files = artifact.type === "html" ? siteFiles(artifact.content) : null;
  downloadBlob(
    new Blob([files ? composeSite(files, {}) : toDocument(artifact)], { type: "text/html;charset=utf-8" }),
    fileName(artifact.title, "html")
  );
}

export function downloadSiteFile(name: SiteFile, text: string): void {
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), name);
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
