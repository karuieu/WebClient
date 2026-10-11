
import { accountSettingKey } from "./session";

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

export interface Artifact {
  title: string;
  html: string;
  streaming?: boolean;
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

export function parseArtifacts(content: string): { artifacts: Artifact[]; text: string } {
  const artifacts: Artifact[] = [];

  let text = content.replace(ARTIFACT_BLOCK, (_, rawAttrs: string, inner: string) => {
    artifacts.push({
      title: tagAttr(rawAttrs, "title") || DEFAULT_TITLE,
      html: inner.trim(),
    });
    return "";
  });

  const openIdx = text.indexOf(OPEN_TAG);
  if (openIdx !== -1) {
    const rest = text.slice(openIdx);
    const gt = rest.indexOf(">");
    // Even an incomplete opening tag must be hidden before its title is known.
    const rawAttrs = gt === -1 ? "" : rest.slice(OPEN_TAG.length, gt);
    const inner = gt === -1 ? "" : rest.slice(gt + 1);
    artifacts.push({
      title: tagAttr(rawAttrs, "title") || DEFAULT_TITLE,
      html: inner,
      streaming: true,
    });
    text = text.slice(0, openIdx);
  }

  return { artifacts, text: text.trim() };
}

const FRAGMENT_STYLES = `
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 32px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; line-height: 1.65; color: #1a1a1a; background: #ffffff;
  }
  h1, h2, h3 { line-height: 1.25; }
  img, table { max-width: 100%; }
  @media (max-width: 640px) { body { padding: 20px 16px; font-size: 16px; } }
  @media print { body { padding: 0; } }
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

export function toDocument(artifact: Artifact): string {
  const html = stripActiveContent(artifact.html);

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

function fileName(title: string, extension: string): string {
  const slug = title
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  return `${slug || "document"}.${extension}`;
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
    `<body>${stripActiveContent(artifact.html)}</body></html>`;
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
