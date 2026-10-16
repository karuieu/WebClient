import { parseMemoryWriteBlock } from "./memoryWrite";
import { PROVIDERS, type ProviderId } from "./providers";
import { REPETITION_NOTICE_KIND } from "./repetition";

// Escapes '<' inside block JSON, so a title or tool name containing '</search>' cannot close the block early.
export function blockJSON(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const STOPPED_NOTICE = `<notice>${JSON.stringify({ kind: "stopped" })}</notice>`;

export const SEARCH_UNAVAILABLE_NOTICE_KIND = "search_unavailable";

export type MessageStep =
  | { kind: "thought"; text: string }
  | { kind: "search"; query: string; sources: { title: string; url: string }[] }
  | { kind: "page"; url: string; title: string; status: "ok" | "error" }
  | { kind: "vision"; name: string; description: string }
  | { kind: "memory"; action: "edit" | "proposal"; file?: string | null; text: string }
  | { kind: "notice"; text: string }
  | { kind: "tool"; connector: string; tool: string; status: "ok" | "error" | "declined" }
  | { kind: "skills"; names: string[] }
  | { kind: "files"; paths: string[] };

type Notice = { reason: string; providerName: string; e2e: boolean };

function noticeText(d: Notice): string {
  if (d.reason === "decision") return "The memory step failed this time, so this answer was written without your memory.";
  const provider = d.providerName || "The selected provider";
  if (d.e2e) {
    return `${provider} has no model for the memory step, so this answer was written without your memory. The memory step always runs at the same provider as the chat. Pick a different provider in the model picker.`;
  }
  if (d.reason === "provider_offline") {
    return `${provider} isn't configured on the server right now, so this answer was written without your memory.`;
  }
  return `${provider} has no usable model for the memory step, so this answer was written without your memory.`;
}

function skillsNoticeText(reason: unknown, providerName: unknown): string {
  if (reason === "decision") return "The skills step failed this time, so this answer was written without your skills.";
  const provider = typeof providerName === "string" && providerName ? providerName : "The selected provider";
  return `${provider} has no model for the skills step, so this answer was written without your skills.`;
}

function searchNoticeText(reason: unknown, resetAt: unknown): string {
  if (reason === "limit") {
    const at = typeof resetAt === "string" ? new Date(resetAt) : null;
    const time = at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
    return `You've used today's web searches, so this answer is without them.${time ? ` They come back at ${time}.` : ""}`;
  }
  if (reason === "exhausted") return "Web search isn't available right now, so this answer is without it.";
  if (reason === "decision") return "Web search was on, but the model couldn't run it this time, so this answer is without it.";
  return "Web search didn't respond, so this answer is without it.";
}

function thoughtOf(inner: string): { text: string; rest: string | null } {
  // Some upstreams leak the answer into the reasoning channel after a literal </think>.
  const cut = inner.indexOf("</think>");
  const raw = cut === -1 ? inner : inner.slice(0, cut);
  return {
    text: raw.replace(/^\s*<think>/, "").trim(),
    rest: cut === -1 ? null : inner.slice(cut + "</think>".length),
  };
}

const BLOCKS =
  /<reasoning>([\s\S]*?)<\/reasoning>|<search>([\s\S]*?)<\/search>|<vision>([\s\S]*?)<\/vision>|<notice>([\s\S]*?)<\/notice>|<memory_write>([\s\S]*?)<\/memory_write>|<tool>([\s\S]*?)<\/tool>|<library>([\s\S]*?)<\/library>|<skills_used>([\s\S]*?)<\/skills_used>|<fetched_page>([\s\S]*?)<\/fetched_page>/g;

function parseBlocks(content: string): { steps: MessageStep[]; answer: string } {
  const steps: MessageStep[] = [];

  let answer = content.replace(BLOCKS, (_, reasoning?: string, search?: string, vision?: string, notice?: string, memory?: string, tool?: string, library?: string, skills?: string, page?: string) => {
    if (reasoning !== undefined) {
      const { text, rest } = thoughtOf(reasoning);
      if (text) steps.push({ kind: "thought", text });
      return rest ?? "";
    }
    try {
      if (search !== undefined) {
        const d = JSON.parse(search);
        if (d && typeof d.query === "string" && Array.isArray(d.results)) {
          steps.push({
            kind: "search",
            query: d.query,
            sources: d.results
              .filter((r: { url?: unknown }) => r && typeof r.url === "string")
              .map((r: { title?: unknown; url: string }) => ({ title: String(r.title ?? r.url), url: r.url })),
          });
        }
      } else if (vision !== undefined) {
        const d = JSON.parse(vision);
        if (d && typeof d.description === "string") {
          steps.push({ kind: "vision", name: String(d.name ?? "image"), description: d.description });
        }
      } else if (notice !== undefined) {
        const d = JSON.parse(notice);
        if (d && typeof d.kind === "string") {
          steps.push({
            kind: "notice",
            text:
              d.kind === REPETITION_NOTICE_KIND
                ? "The model started repeating itself, so the answer was stopped. Try Retry."
                : d.kind === SEARCH_UNAVAILABLE_NOTICE_KIND
                ? searchNoticeText(d.reason, d.resetAt)
                : d.kind === "stopped"
                ? "You stopped this answer."
                : d.kind === "skills_skipped"
                ? skillsNoticeText(d.reason, d.provider_name)
                : noticeText({
                    reason: String(d.reason ?? ""),
                    providerName: String(d.provider_name ?? d.provider ?? ""),
                    e2e: d.e2e === true,
                  }),
          });
        }
      } else if (memory !== undefined) {
        const d = parseMemoryWriteBlock(memory);
        if (d) {
          steps.push({
            kind: "memory",
            action: d.action,
            file: d.file ? (d.category ? `${d.category} / ${d.file}` : d.file) : null,
            text: d.text,
          });
        }
      } else if (tool !== undefined) {
        const d = JSON.parse(tool);
        if (d && typeof d.connector === "string" && typeof d.tool === "string") {
          const status = d.status === "error" || d.status === "declined" ? d.status : "ok";
          steps.push({ kind: "tool", connector: d.connector, tool: d.tool, status });
        }
      } else if (library !== undefined) {
        const d = JSON.parse(library);
        const paths = Array.isArray(d?.paths) ? d.paths.filter((p: unknown): p is string => typeof p === "string") : [];
        if (paths.length > 0) steps.push({ kind: "files", paths });
      } else if (skills !== undefined) {
        const d = JSON.parse(skills);
        const names = Array.isArray(d?.names) ? d.names.filter((n: unknown): n is string => typeof n === "string") : [];
        if (names.length > 0) steps.push({ kind: "skills", names });
      } else if (page !== undefined) {
        const d = JSON.parse(page);
        // The address becomes a link, and the model could write this block itself.
        if (d && typeof d.url === "string" && /^https?:\/\//i.test(d.url)) {
          steps.push({ kind: "page", url: d.url, title: typeof d.title === "string" ? d.title : "", status: d.status === "error" ? "error" : "ok" });
        }
      }
    } catch {
    }
    return "";
  });

  const open = answer.indexOf("<reasoning>");
  if (open !== -1) {
    const { text, rest } = thoughtOf(answer.slice(open + "<reasoning>".length));
    if (text) steps.push({ kind: "thought", text });
    answer = answer.slice(0, open) + (rest ?? "");
  }

  return { steps, answer: answer.trim() };
}

export type PreparationSegment =
  | { kind: "message"; text: string }
  | { kind: "processing"; steps: MessageStep[] };

const HELPER_MESSAGES = /<helper_message>([\s\S]*?)(?:<\/helper_message>|$)/g;

export function parseMessageBlocks(content: string): { steps: MessageStep[]; answer: string; preparation?: PreparationSegment[] } {
  const parsed = parseBlocks(content.replace(HELPER_MESSAGES, ""));
  const preparation: PreparationSegment[] = [];
  let cursor = 0;
  for (const match of content.matchAll(HELPER_MESSAGES)) {
    const steps = parseBlocks(content.slice(cursor, match.index)).steps;
    if (steps.length > 0) preparation.push({ kind: "processing", steps });
    try {
      const data = JSON.parse(match[1]) as { text?: unknown } | null;
      if (typeof data?.text === "string" && data.text.trim()) preparation.push({ kind: "message", text: data.text.trim() });
    } catch {
    }
    cursor = match.index + match[0].length;
  }
  if (cursor === 0) return parsed;
  const steps = parseBlocks(content.slice(cursor)).steps;
  if (steps.length > 0) preparation.push({ kind: "processing", steps });
  return { ...parsed, preparation };
}

export function splitQuote(text: string): { quote: string | null; text: string } {
  const m = /^((?:>[^\n]*\n?)+)\n+([\s\S]*)$/.exec(text);
  if (!m) return { quote: null, text };
  const quote = m[1]
    .split("\n")
    .map((l) => l.replace(/^> ?/, ""))
    .join("\n")
    .trim();
  return { quote, text: m[2].trim() };
}

export function toBlockquote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

const EXTRA_NAMES: Record<string, string> = {
  "qwen3-8-27b": "Qwen 3.8 27B",
  "glm-5-3-flash": "GLM 5.3 Flash",
  "glm-5-3": "GLM 5.3"
};

const PROVIDER_NAMES: Record<string, string> = {
  nearai: "NEAR AI",
  phala: "Phala",
};

export function modelLabel(model?: string, provider?: string): string | undefined {
  if (!model) return undefined;
  let name = EXTRA_NAMES[model];
  if (!name && (model === "fast" || model === "smart")) {
    const tier = model === "fast" ? "light" : "heavy";
    const info = provider ? PROVIDERS[provider as ProviderId] : undefined;
    name = info?.models.find((m) => m.tier === tier)?.name ?? (tier === "light" ? "Light" : "Heavy");
  }
  name ??= model;
  const p = provider ? (PROVIDER_NAMES[provider] ?? provider) : "";
  return p ? `${name} · ${p}` : name;
}
