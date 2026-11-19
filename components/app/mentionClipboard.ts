import type { ArtifactType } from "@/lib/artifacts/artifacts";

export type CopiedMention =
  | { kind: "skill"; id: string; source: "user" | "karui"; label: string }
  | { kind: "artifact"; chatId: string; path: string; title: string; type: ArtifactType };

export type CopiedPart = string | CopiedMention;

function isArtifactType(value: unknown): value is ArtifactType {
  return value === "markdown" || value === "html" || value === "code" || value === "slides";
}

export function mentionText(mention: CopiedMention): string {
  return mention.kind === "artifact" ? `@${mention.title}` : mention.label;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Plain text for other apps; the HTML also says what each skill or artifact points to, so the composer can bring it back.
export function writeMentionClipboard(parts: CopiedPart[]): { text: string; html: string } {
  const text = parts.map((part) => (typeof part === "string" ? part : mentionText(part))).join("");
  const html = parts.map((part) => (typeof part === "string"
    ? escapeHtml(part).replace(/\n/g, "<br>")
    : `<span data-karui-mention="${escapeHtml(JSON.stringify(part))}">${escapeHtml(mentionText(part))}</span>`)).join("");
  return { text, html };
}

// The clipboard may hold HTML from anywhere, so every mention is checked field by field.
function parseMention(value: string): CopiedMention | null {
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== "object") return null;
    const m = data as Record<string, unknown>;
    if (m.kind === "skill" && typeof m.id === "string" && (m.source === "user" || m.source === "karui") && typeof m.label === "string") {
      return { kind: "skill", id: m.id, source: m.source, label: m.label };
    }
    if (m.kind === "artifact" && typeof m.chatId === "string" && typeof m.path === "string" && typeof m.title === "string" && isArtifactType(m.type)) {
      return { kind: "artifact", chatId: m.chatId, path: m.path, title: m.title, type: m.type };
    }
  } catch {}
  return null;
}

// Null when the HTML holds no mention, so the caller pastes plain text as before.
export function readMentionClipboard(html: string): CopiedPart[] | null {
  const parts: CopiedPart[] = [];
  let found = false;
  const visit = (node: Node): void => {
    if (node instanceof HTMLElement && node.dataset.karuiMention !== undefined) {
      const mention = parseMention(node.dataset.karuiMention);
      if (mention) found = true;
      parts.push(mention ?? node.textContent ?? "");
    } else if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
    } else if (node instanceof HTMLBRElement) {
      parts.push("\n");
    } else {
      node.childNodes.forEach(visit);
    }
  };
  new DOMParser().parseFromString(html, "text/html").body.childNodes.forEach(visit);
  return found ? parts : null;
}
