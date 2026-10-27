// Helper phases run at the provider selected in settings. The chat model answers
// at its own provider and can replace a failed helper only when both match.

import { nearAICompletion } from "./nearaiClient";
import { phalaCompletion } from "./phalaClient";
import { type ProviderId } from "./providers";
import { buildReasoningParams, getReasoningLevelsFor, templateEffort } from "./reasoning";
import { onSessionCleared } from "./session";
import { type MemoryFileForChat } from "./memory";
import { MEMORY_WRITE_LABEL_EDIT, MEMORY_WRITE_LABEL_PROPOSAL } from "./memoryWrite";
import { API_URL, apiFetch } from "./api";
import { lacksBasePrompt } from "./systemPrompt";
import type { ToolResponse } from "./jsonTools";
import { StoppedError, throwIfStopped } from "./errors";

export interface ModelMessage {
  role: string;
  content: unknown;
}

export interface ToolCall {
  name: string;
  arguments: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface HelperModel {
  providerModelID: string;
  reasoningParams: Record<string, unknown>;
}

// The helper at the selected provider. A chat model at that same provider can
// replace it after a failure.
export interface HelperTurn {
  provider: ProviderId;
  main?: () => Promise<HelperModel>;
  signal?: AbortSignal;
}

type HelperTarget = ProviderId | HelperTurn;

async function complete(
  provider: ProviderId,
  model: HelperModel,
  messages: ModelMessage[],
  tools?: ToolDefinition[],
  phase?: "compression"
): Promise<ToolResponse> {
  const call = { ...model, turns: messages, tools, phase, withoutBasePrompt: lacksBasePrompt(messages) };
  return provider === "nearai" ? nearAICompletion(call) : phalaCompletion(call);
}

async function decide(target: HelperTarget, messages: ModelMessage[], tools?: ToolDefinition[], phase?: "compression"): Promise<ToolResponse> {
  const turn = typeof target === "string" ? { provider: target } : target;
  throwIfStopped(turn.signal);
  const helper = await helperModel(turn.provider);
  const main = turn.main ? await turn.main() : null;
  const canSwitch = main !== null && main.providerModelID !== helper?.providerModelID;
  throwIfStopped(turn.signal);

  if (helper) {
    try {
      const result = await complete(turn.provider, helper, messages, tools, phase);
      throwIfStopped(turn.signal);
      return result;
    } catch (error) {
      throwIfStopped(turn.signal);
      if (error instanceof StoppedError || !canSwitch) throw error;
    }
  }
  if (!main) throw new Error("No model for this helper phase");
  const result = await complete(turn.provider, main, messages, tools, phase);
  throwIfStopped(turn.signal);
  return result;
}

// Helper calls send the template's "low" explicitly: left unset, Qwen thinks at xhigh and GLM at max, spending a whole answer's worth of tokens on a short decision.
export function helperReasoningParams(model: string, provider: ProviderId): Record<string, unknown> {
  const level = getReasoningLevelsFor(model, provider).find((l) => templateEffort(model, l) === "low") ?? null;
  return buildReasoningParams(model, provider, level);
}

type HelperModels = Partial<Record<ProviderId, { model: string; provider_model_id: string }>>;

let helperModelsCache: HelperModels | null = null;

onSessionCleared(() => {
  helperModelsCache = null;
});

// The selected helper provider sees memory and message content for helper calls.
async function helperModel(provider: ProviderId): Promise<HelperModel | null> {
  if (!helperModelsCache) {
    const response = await apiFetch(`${API_URL}/api/ai/helper-models`);
    if (!response.ok) throw new Error("Could not fetch helper models");
    helperModelsCache = ((await response.json()) as { models?: HelperModels }).models ?? {};
  }
  const entry = helperModelsCache[provider];
  if (!entry?.provider_model_id) return null;
  return { providerModelID: entry.provider_model_id, reasoningParams: helperReasoningParams(entry.model, provider) };
}

async function canRun(target: HelperTarget): Promise<boolean> {
  if (typeof target === "string") return (await helperModel(target)) !== null;
  return target.main !== undefined || (await helperModel(target.provider)) !== null;
}

// A memory note the answering model left: the fact and the file it belongs in.
export interface MemoryWriteRequest {
  fileId: string | null;
  explicit: boolean;
  note: string;
}

const EXPLICIT_MEMORY_REQUEST = /\b(?:zapamiętaj|zapisz|zanotuj)\b|\bremember\s*[:,]?\s*(?:that\s+)?(?:i|we|my|our|this|the)\b|\b(?:save|note)\s*[:,]?\s*(?:(?:to|in)\s+(?:your\s+)?memory\s*[:,]?\s*)?(?:that\s+)?(?:i|we|my|our|this|the)\b/iu;

export function isExplicitMemoryRequest(message: string): boolean {
  return EXPLICIT_MEMORY_REQUEST.test(message);
}

const RECOVER_MEMORY_WRITE_TOOL = {
  name: "recover_memory_write",
  description: "Recover a direct request to save a durable fact to long-term memory.",
  parameters: {
    type: "object",
    properties: {
      file: { type: "string", description: "The memory file id where the fact belongs, or an empty string when no file fits." },
      note: { type: "string", description: "The fact to save, one sentence in third person." },
    },
    required: ["file", "note"],
  },
};

const RECOVER_MEMORY_WRITE_PROMPT = `The answering model may have omitted a memory save request. Inspect the user's latest message and the memory file index.

Call recover_memory_write only when the user directly asks to remember, save or note a durable fact. Do nothing for a negation, a question about memory, or a fact merely mentioned in passing. Choose a writable file from the index, or an empty file value when none fits. Write one sentence in third person. Never invent facts or record secrets, passwords or API keys.`;

export async function recoverMemoryWrite(
  target: HelperTarget,
  files: MemoryFileForChat[],
  lastUserMessage: string
): Promise<MemoryWriteRequest | null> {
  const writable = files.filter((file) => !file.readOnly);
  const index = writable.map((file) => ({ id: file.id, category: file.category, name: file.name, description: file.description }));
  try {
    const { toolCalls } = await decide(
      target,
      [
        { role: "system", content: RECOVER_MEMORY_WRITE_PROMPT },
        { role: "user", content: `<memory_index>${JSON.stringify(index)}</memory_index>\n\n<latest_user_message>\n${lastUserMessage}\n</latest_user_message>` },
      ],
      [RECOVER_MEMORY_WRITE_TOOL]
    );
    for (const call of toolCalls) {
      if (call.name !== RECOVER_MEMORY_WRITE_TOOL.name) continue;
      try {
        const args = JSON.parse(call.arguments) as { file?: unknown; note?: unknown };
        const note = typeof args.note === "string" ? args.note.trim() : "";
        if (!note || note.length > 1000) continue;
        const fileId = typeof args.file === "string" && writable.some((file) => file.id === args.file) ? args.file : null;
        return { fileId, explicit: true, note };
      } catch {
      }
    }
  } catch (error) {
    if (error instanceof StoppedError) throw error;
  }
  return null;
}

// The write phase sees one file's full content and no other file.
// Never creates files: a new topic needs the whole tree to avoid duplicates, so it stays a proposal for the organising pass.

const MEMORY_WRITE_PROMPT = `You update ONE file of the user's long-term memory. You get the file (category, name, description, full content), the user's latest message and a note naming the fact to save.

Rules:
- First check the file. If the fact is already recorded, call nothing.
- edit_memory_file REPLACES THE WHOLE FILE: pass the complete new content with every existing fact kept and the new one merged in where it belongs. If the new fact contradicts an old one, update the old one instead of adding a second version. Markdown, third person ("The user …"), under ~150 lines.
- propose_memory_change changes nothing now — it leaves a one-sentence suggestion for the next periodic memory review.
- Never record secrets, passwords or API keys.`;

const EDIT_MEMORY_FILE_TOOL = {
  name: "edit_memory_file",
  description: "Replace the file with its complete updated content.",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Full new file content — every existing fact kept, the new fact merged in.",
      },
      description: {
        type: "string",
        description: "Updated one-line summary of the file. Omit to keep the current one.",
      },
      summary: {
        type: "string",
        description: "What changed, a few words, shown to the user (e.g. 'Added: writes Go').",
      },
    },
    required: ["content", "summary"],
  },
};

const PROPOSE_MEMORY_CHANGE_TOOL = {
  name: "propose_memory_change",
  description: "Leave a suggestion for the periodic memory review instead of changing the file now.",
  parameters: {
    type: "object",
    properties: {
      proposal: { type: "string", description: "The suggested change, one sentence, third person." },
    },
    required: ["proposal"],
  },
};

export type MemoryWriteDecision =
  | { kind: "edit"; content: string; description: string; summary: string }
  | { kind: "proposal"; text: string };

// Edits that keep less than this fraction of a file are rejected. edit_memory_file rewrites whole files, and a cheap model can silently drop facts; the edit becomes a proposal instead.
const EDIT_MIN_KEPT_RATIO = 0.5;

// The write policy is enforced in code, not in the prompt: nothing changes without an explicit user request. A call to an edit tool the model was never given becomes a proposal.
export function parseMemoryWriteDecision(
  calls: ToolCall[],
  file: Pick<MemoryFileForChat, "content" | "description">,
  request: MemoryWriteRequest
): MemoryWriteDecision | null {
  let attemptedEdit = false;

  for (const call of calls) {
    if (call.name !== EDIT_MEMORY_FILE_TOOL.name) continue;
    attemptedEdit = true;
    if (!request.explicit) break;
    try {
      const args = JSON.parse(call.arguments) as { content?: unknown; description?: unknown; summary?: unknown };
      const content = typeof args.content === "string" ? args.content.trim() : "";
      if (!content) continue;
      const before = file.content.trim().length;
      if (before > 0 && content.length < before * EDIT_MIN_KEPT_RATIO) break;
      const summary = typeof args.summary === "string" && args.summary.trim() ? args.summary.trim() : request.note;
      const description =
        typeof args.description === "string" && args.description.trim() ? args.description.trim() : file.description;
      return { kind: "edit", content, description, summary };
    } catch {
    }
  }

  for (const call of calls) {
    if (call.name !== PROPOSE_MEMORY_CHANGE_TOOL.name) continue;
    try {
      const args = JSON.parse(call.arguments) as { proposal?: unknown };
      const text = typeof args.proposal === "string" ? args.proposal.trim() : "";
      if (text) return { kind: "proposal", text };
    } catch {
    }
  }

  if (attemptedEdit) return { kind: "proposal", text: request.note };

  return null;
}

// Uses the selected helper provider. Returns null on error: a failed memory write must not stop the answer.
export async function decideMemoryWrite(
  target: HelperTarget,
  file: MemoryFileForChat,
  lastUserMessage: string,
  request: MemoryWriteRequest
): Promise<MemoryWriteDecision | null> {
  if (!(await canRun(target))) return null;

  const tools = request.explicit
    ? [EDIT_MEMORY_FILE_TOOL, PROPOSE_MEMORY_CHANGE_TOOL]
    : [PROPOSE_MEMORY_CHANGE_TOOL];

  let toolCalls: ToolCall[];
  try {
    ({ toolCalls } = await decide(
      target,
      [
        { role: "system", content: MEMORY_WRITE_PROMPT },
        {
          role: "user",
          content:
            `<memory_file category=${JSON.stringify(file.category)} name=${JSON.stringify(file.name)} description=${JSON.stringify(file.description)}>\n${file.content}\n</memory_file>\n\n` +
            `<latest_user_message>\n${lastUserMessage}\n</latest_user_message>\n\n` +
            `<note explicit="${request.explicit}">${request.note}</note>`,
        },
      ],
      tools
    ));
  } catch (error) {
    if (error instanceof StoppedError) throw error;
    return null;
  }

  return parseMemoryWriteDecision(toolCalls, file, request);
}

// Organising pass: the model reads recent transcripts and the whole memory tree, and returns create/update operations. The browser applies them and encrypts each field, so the server only receives ciphertext.

const MEMORY_ORGANIZE_PROMPT = `You maintain the user's long-term memory for Karui, organized as CATEGORIES containing FILES (e.g. category "You" → file "Profile"; category "Topics" → file "Homelab"). You'll see the current tree (category names; per file: id, name, description, content) and transcripts of recent conversations. Call apply_memory_changes with files to create or update.

Rules:
- Write content in Markdown, third person ("The user ..."), under ~150 lines per file.
- Prefer UPDATING an existing file (pass its file_id) over creating a near-duplicate.
- Only create a new category when no existing one fits — categories are free-form, invent them as needed.
- Each file covers ONE coherent topic; description is a short one-line summary used later to decide whether to read it.
- Record durable facts only: identity, preferences, expertise, ongoing projects/goals, constraints, tools/languages, formatting preferences. Never record one-off trivia, small talk, secrets, passwords, API keys, or verbatim messages.
- If nothing worth remembering changed, call apply_memory_changes with an empty operations array.
- Only create_file / update_file are available — no delete/rename.
- Lines starting with "${MEMORY_WRITE_LABEL_PROPOSAL}" are suggestions noted mid-conversation but NOT saved. Treat them as hints: check each against the conversation and apply it only if it is durable and not already in the tree.
- Lines starting with "${MEMORY_WRITE_LABEL_EDIT}" were already saved at the time — the tree reflects them. Do not record them again.`;

const APPLY_MEMORY_CHANGES_TOOL = {
  name: "apply_memory_changes",
  description:
    "Create or update memory files based on the conversations. Call with an empty operations array if nothing changed.",
  parameters: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create_file", "update_file"] },
            category: {
              type: "string",
              description: "Category name. Required for create_file (existing or new, free-form).",
            },
            file_id: {
              type: "string",
              description: "Required for update_file — id of the existing file to update.",
            },
            file_name: { type: "string", description: "Required for create_file." },
            description: {
              type: "string",
              description: "One-line summary used to decide when to read this file later.",
            },
            content: { type: "string", description: "Full file content, Markdown, third person." },
          },
          required: ["action", "description", "content"],
        },
      },
    },
    required: ["operations"],
  },
};

export const MEMORY_TRANSCRIPT_MAX_CHARS = 120_000;
const MEMORY_TREE_MAX_CHARS = 80_000;

export interface MemoryTreeFile {
  fileId: string;
  name: string;
  description: string;
  content: string;
}

export interface MemoryTreeCategory {
  name: string;
  files: MemoryTreeFile[];
}

export interface MemoryOperation {
  action: "create_file" | "update_file";
  category?: string;
  file_id?: string;
  file_name?: string;
  description: string;
  content: string;
}

// The model must see file ids, or it cannot point at a file to update and creates duplicates. Only files it saw in full may be updated, since update_file replaces the whole content.
function serializeMemoryTree(tree: MemoryTreeCategory[]): { block: string; shown: Set<string> } {
  const parts: string[] = ["<current_memory_tree>"];
  const shown = new Set<string>();
  let budget = MEMORY_TREE_MAX_CHARS;
  let omitted = false;
  for (const category of tree) {
    parts.push(`<category name=${JSON.stringify(category.name)}>`);
    for (const file of category.files) {
      const attrs = `id=${JSON.stringify(file.fileId)} name=${JSON.stringify(file.name)} description=${JSON.stringify(file.description)}`;
      const full = `<file ${attrs}>${file.content}</file>`;
      if (full.length <= budget) {
        parts.push(full);
        budget -= full.length;
        shown.add(file.fileId);
      } else {
        parts.push(`<file ${attrs} content_omitted="true"/>`);
        omitted = true;
      }
    }
    parts.push("</category>");
  }
  if (omitted) {
    parts.push(
      `<note>Files marked content_omitted="true" were too long to show. They exist: don't create duplicates of them, and don't update them in this pass.</note>`
    );
  }
  parts.push("</current_memory_tree>");
  return { block: parts.join("\n"), shown };
}

// Validates operations: a missing field would otherwise pass downstream as an empty category or a nameless file.
function parseMemoryOperations(calls: ToolCall[]): MemoryOperation[] {
  const out: MemoryOperation[] = [];
  for (const call of calls) {
    let parsed: { operations?: unknown };
    try {
      parsed = JSON.parse(call.arguments) as { operations?: unknown };
    } catch {
      continue;
    }
    if (!Array.isArray(parsed.operations)) continue;

    for (const raw of parsed.operations) {
      if (!raw || typeof raw !== "object") continue;
      const op = raw as Partial<MemoryOperation>;
      if (typeof op.description !== "string" || typeof op.content !== "string") continue;

      if (op.action === "create_file") {
        if (!op.category?.trim() || !op.file_name?.trim()) continue;
      } else if (op.action === "update_file") {
        if (!op.file_id?.trim()) continue;
      } else {
        continue;
      }
      out.push(op as MemoryOperation);
    }
  }
  return out;
}

// Throws when the provider has no model for this role. Otherwise the run would 'succeed' with zero operations and the cursors would advance past conversations that never reached memory.
export async function organizeMemoryE2E(
  provider: ProviderId,
  tree: MemoryTreeCategory[],
  transcript: string
): Promise<MemoryOperation[]> {
  const helper = await helperModel(provider);
  if (!helper) {
    throw new Error("The selected provider has no model for organizing memory");
  }

  const clipped =
    transcript.length > MEMORY_TRANSCRIPT_MAX_CHARS
      ? transcript.slice(0, MEMORY_TRANSCRIPT_MAX_CHARS)
      : transcript;
  const { block: treeBlock, shown } = serializeMemoryTree(tree);

  const { toolCalls } = await complete(
    provider,
    helper,
    [
      {
        role: "system",
        content: `${MEMORY_ORGANIZE_PROMPT}\n\n<current_datetime>${new Date().toUTCString()}</current_datetime>`,
      },
      {
        role: "user",
        content: `${treeBlock}\n\n<recent_conversations>\n${clipped}\n</recent_conversations>\n\nUpdate memory via apply_memory_changes.`,
      },
    ],
    [APPLY_MEMORY_CHANGES_TOOL]
  );

  return parseMemoryOperations(toolCalls).filter((op) => op.action !== "update_file" || shown.has(op.file_id ?? ""));
}

const PROJECT_MEMORY_ORGANIZE_PROMPT = `You maintain the memory of one PROJECT in Karui: a set of files the project's chats read before answering. You'll see the project's name and goal, its current memory files (id, name, description, content) and transcripts of recent conversations from this project. Call apply_memory_changes with files to create or update (use category "Memory" for new files), and set_chat_briefs with one line per conversation.

Rules:
- Record what matters for this project's work: decisions, deadlines, requirements, sources, people involved, open questions, how the user wants this work done. Not general facts about the user.
- Write content in Markdown, under ~150 lines per file; each file covers one topic and has a one-line description.
- Prefer UPDATING an existing file (pass its file_id) over creating a near-duplicate. Only create_file / update_file are available.
- Never record secrets, passwords, API keys, or verbatim messages. If nothing worth remembering changed, call apply_memory_changes with an empty operations array.
- Lines starting with "${MEMORY_WRITE_LABEL_PROPOSAL}" are suggestions noted mid-conversation but NOT saved; apply them only if durable and new. Lines starting with "${MEMORY_WRITE_LABEL_EDIT}" are already saved.
- set_chat_briefs: for every conversation shown (by its id), one sentence of at most ~20 words, in the conversation's language, on what it is about as a whole.`;

const SET_CHAT_BRIEFS_TOOL = {
  name: "set_chat_briefs",
  description: "One line per conversation on what it is about, shown next to it in the project.",
  parameters: {
    type: "object",
    properties: {
      briefs: {
        type: "array",
        items: {
          type: "object",
          properties: { chat_id: { type: "string" }, brief: { type: "string" } },
          required: ["chat_id", "brief"],
        },
      },
    },
    required: ["briefs"],
  },
};

const BRIEF_MAX_CHARS = 240;

function parseBriefs(calls: ToolCall[], chatIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const call of calls) {
    if (call.name !== SET_CHAT_BRIEFS_TOOL.name) continue;
    try {
      const args = JSON.parse(call.arguments) as { briefs?: unknown };
      if (!Array.isArray(args.briefs)) continue;
      for (const b of args.briefs as { chat_id?: unknown; brief?: unknown }[]) {
        if (typeof b?.chat_id !== "string" || typeof b.brief !== "string") continue;
        const brief = b.brief.trim().slice(0, BRIEF_MAX_CHARS);
        if (chatIds.has(b.chat_id) && brief) out.set(b.chat_id, brief);
      }
    } catch {
    }
  }
  return out;
}

export async function organizeProjectMemoryE2E(
  provider: ProviderId,
  project: { name: string; goal: string },
  files: MemoryTreeFile[],
  transcript: string,
  chatIds: string[]
): Promise<{ operations: MemoryOperation[]; briefs: Map<string, string> }> {
  const helper = await helperModel(provider);
  if (!helper) throw new Error("The selected provider has no model for organizing memory");

  const clipped = transcript.length > MEMORY_TRANSCRIPT_MAX_CHARS ? transcript.slice(0, MEMORY_TRANSCRIPT_MAX_CHARS) : transcript;
  const { block: treeBlock, shown } = serializeMemoryTree([{ name: "Memory", files }]);
  const projectBlock = `<project name=${JSON.stringify(project.name)}>${project.goal ? `\nGoal: ${project.goal}\n` : ""}</project>`;

  const { toolCalls } = await complete(
    provider,
    helper,
    [
      { role: "system", content: `${PROJECT_MEMORY_ORGANIZE_PROMPT}\n\n<current_datetime>${new Date().toUTCString()}</current_datetime>` },
      {
        role: "user",
        content: `${projectBlock}\n\n${treeBlock}\n\n<recent_conversations>\n${clipped}\n</recent_conversations>\n\nUpdate the project's memory via apply_memory_changes and the briefs via set_chat_briefs.`,
      },
    ],
    [APPLY_MEMORY_CHANGES_TOOL, SET_CHAT_BRIEFS_TOOL]
  );

  return {
    operations: parseMemoryOperations(toolCalls).filter((op) => op.action !== "update_file" || shown.has(op.file_id ?? "")),
    briefs: parseBriefs(toolCalls, new Set(chatIds)),
  };
}

function stripReasoning(text: string): string {
  return text.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();
}

// The only definition of this prompt. Copies drift silently, so do not add a second one.
const COMPRESSION_PROMPT = `You compress the earlier part of a conversation so it can be dropped from the context window without losing what matters.

Write a summary that lets the assistant continue the conversation as if it had read every message:
- Preserve concrete facts the user gave about themselves, their project, their constraints and their preferences.
- Preserve decisions that were made and the reasoning behind them, including options that were rejected and why.
- Preserve open questions, unfinished work, and anything the user asked to come back to.
- Preserve exact identifiers verbatim: names, file paths, versions, numbers, URLs, commands.
- Drop pleasantries, restatements, and any reasoning that led nowhere.
- Write in the language the conversation is in.

Output ONLY the summary as plain prose or bullet points. No preamble, no meta-commentary about summarizing.`;

const COMPRESSION_MAX_TURN_CHARS = 20_000;

export interface CompressionTurn {
  role: string;
  content: string;
}

function buildCompressionInput(turns: CompressionTurn[], previousSummary: string): string {
  const parts: string[] = [];

  const previous = previousSummary.trim();
  if (previous) {
    parts.push(`<previous_summary>\n${previous}\n</previous_summary>\n`);
  }

  const body = turns
    .map((turn) => {
      let content = turn.content.trim();
      if (!content) return null;
      if (content.length > COMPRESSION_MAX_TURN_CHARS) {
        content = `${content.slice(0, COMPRESSION_MAX_TURN_CHARS)}\n[…]`;
      }
      const role = turn.role.trim().toLowerCase() === "assistant" ? "ASSISTANT" : "USER";
      return `${role}: ${content}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n\n");

  parts.push(`<conversation>\n${body}\n\n</conversation>`);
  return parts.join("\n");
}

// Summarises older turns with a model in the enclave. Compression is an improvement, not a precondition: on failure the old turns are simply trimmed.
export async function compressHistoryE2E(
  target: HelperTarget,
  turns: CompressionTurn[],
  previousSummary: string
): Promise<string> {
  if (turns.length === 0) return "";
  if (!(await canRun(target))) return "";

  // phase: "compression" — billed from the separate pool (Free), not the plan.
  const { content } = await decide(
    target,
    [
      { role: "system", content: COMPRESSION_PROMPT },
      { role: "user", content: buildCompressionInput(turns, previousSummary) },
    ],
    undefined,
    "compression"
  );

  return stripReasoning(content);
}
