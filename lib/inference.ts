// Inference for the E2E path. The browser builds the whole request (prompt, memory, search results) and encrypts messages to the attested enclave of the turn's provider; the backend only proxies ciphertext. Helper phases use the same provider; see helperPhases.ts.

import { getUser, onSessionCleared } from "./session";
import { getArtifactsEnabled } from "./artifacts";
import { PROVIDERS, type ProviderId } from "./providers";
import { type LiveMemoryEdit, type MemoryFileForChat } from "./memory";
import { encodeMemoryWriteBlock } from "./memoryWrite";
import { blockJSON } from "./messageBlocks";
import {
  decideMemoryWrite,
  helperReasoningParams,
  helperTurnFor,
  runPreparationPhase,
  runConnectorPhase,
  type MemorySelection,
  type HelperModel,
  type HelperTurn,
  type LibraryIndexEntry,
  type MemoryWriteRequest,
  type ModelMessage,
} from "./helperPhases";
import { buildReasoningParams, type ReasoningEffort } from "./reasoning";
import { StoppedError } from "./errors";
import { contextBudget, trimTurns } from "./context";
import { libraryBlock } from "./projectFiles";
import { skillsPromptBlock, type SkillForChat } from "./skills";
import { isNearAIVerified, streamNearAIChat } from "./nearaiClient";
import { isPhalaVerified, streamPhalaChat } from "./phalaClient";
import { API_URL, apiFetch } from "./api";
import { fetchSystemPrompt } from "./systemPrompt";

export function isProviderVerified(provider: ProviderId): boolean {
  return provider === "nearai" ? isNearAIVerified() : isPhalaVerified();
}

interface CachedModel {

  providerModelIDs: Record<string, string>;
  contextWindow: number;
}
let modelCatalog: Record<string, CachedModel> | null = null;

// The model catalogue depends on the TIER, so it has to be dropped on sign-out,
// or the next account in the same tab inherits the previous one's.
onSessionCleared(() => {
  modelCatalog = null;
});

async function loadModelCatalog(): Promise<Record<string, CachedModel>> {
  if (!modelCatalog) {
    const response = await apiFetch(`${API_URL}/api/ai/models`);
    if (!response.ok) throw new Error("Could not fetch the model list");
    const payload = (await response.json()) as {
      models?: Array<{
        id: string;
        provider_model_ids?: Record<string, string>;
        context_window?: number;
      }>;
    };
    if (!Array.isArray(payload.models)) {
      throw new Error("Unexpected response shape from /api/ai/models");
    }
    // The map is installed only once it's complete. Assigning an empty object
    // before the loop would poison the cache on any error inside it: later sends
    // would see a non-empty cache, skip the fetch and report "model unavailable
    // from provider" instead of the real cause.
    const byModel: Record<string, CachedModel> = {};
    for (const m of payload.models) {
      byModel[m.id] = {
        providerModelIDs: m.provider_model_ids ?? {},
        contextWindow: m.context_window ?? 0,
      };
    }
    modelCatalog = byModel;
  }
  return modelCatalog;
}

// Same arithmetic as the send path; exported for the compression gate. Counts only the base prompt, so it slightly overestimates the budget.
export async function contextBudgetFor(modelId: string): Promise<number> {
  const [prompt, catalog] = await Promise.all([fetchSystemPrompt(), loadModelCatalog()]);
  return contextBudget(getUser()?.tier ?? "free", catalog[modelId]?.contextWindow ?? 0, prompt);
}

// The window comes from /api/ai/models rather than a client copy of the catalogue, so backend changes reach here.
async function fetchModelInfo(
  modelId: string,
  provider: ProviderId
): Promise<{ providerModelID: string; contextWindow: number }> {
  const catalog = await loadModelCatalog();
  const entry = catalog[modelId];
  const resolved = entry?.providerModelIDs[provider];
  if (!resolved) throw new Error(`Model ${modelId} is not available from provider ${provider}`);
  return { providerModelID: resolved, contextWindow: entry.contextWindow };
}

export function chatModelAsHelper(modelId: string, provider: ProviderId): () => Promise<HelperModel> {
  return async () => ({
    providerModelID: (await fetchModelInfo(modelId, provider)).providerModelID,
    reasoningParams: helperReasoningParams(modelId, provider),
  });
}

// Block order matters: providers cache the longest common token prefix, so stable blocks go first and per-message memory goes last. Must match the backend's order.
async function buildSystemPrompt(opts: {
  projectContext: string;
  conversationSummary: string;
  memoryBlock: string;
  memoryScope: "user" | "project";

  projectFilesBlock: string;
  skillsBlock: string;
  customInstructions: string;
  generateTitle: boolean;
  generateBrief: boolean;
  webSearch: boolean;
  provider: ProviderId;
  providerModelID: string;
}): Promise<string> {
  let prompt = await fetchSystemPrompt();

  const instructions = opts.customInstructions.trim();
  if (instructions) {
    prompt +=
      "\n\n<user_custom_instructions>\nInstructions the user wrote for how you should behave. Follow them unless they conflict with safety.\n" +
      instructions +
      "\n</user_custom_instructions>";
  }

  const project = opts.projectContext.trim();
  if (project) {
    prompt += "\n\n<project_context>\n" + project + "\n</project_context>";
  }

  // Stable within a chat, so it sits above memory, which changes with every message. Keeps the prefix cache hitting.
  const summary = opts.conversationSummary.trim();
  if (summary) {
    prompt +=
      "\n\n<conversation_summary>\nThe earlier part of this conversation is no longer in the context window. This is a summary of it — treat it as something you remember, not as something you were told. Do not mention the summary or apologize for missing context.\n" +
      summary +
      "\n</conversation_summary>";
  }

  if (!opts.webSearch) {
    prompt +=
      "\n\n<web_search_status>Web search is currently DISABLED by the user. Do NOT attempt to call any search tool, do NOT output any tool call syntax like [TOOL_CALL] or similar. If the user asks something that clearly needs current information, tell them to enable web search in settings.</web_search_status>";
  }
  if (!getArtifactsEnabled()) {
    prompt +=
      "\n\n<artifacts_status>Artifacts are currently DISABLED by the user. Do NOT emit any <artifact> block — write the full answer inline in the chat instead.</artifacts_status>";
  }
  if (opts.generateTitle) {
    prompt += opts.generateBrief
      ? "\n\n<chat_title_request>This is the first message of a new conversation. Begin your reply with a short conversation title (3-6 words, in the SAME language as the user's message) wrapped exactly like this: <chat_title>Title here</chat_title>, then one sentence of at most 20 words on what this conversation is about, in the same language, wrapped exactly like this: <chat_brief>Sentence here</chat_brief> — then continue with your normal answer. Both tags must appear before any other text and must not be mentioned anywhere else.</chat_title_request>"
      : "\n\n<chat_title_request>This is the first message of a new conversation. Begin your reply with a short conversation title (3-6 words, in the SAME language as the user's message) wrapped exactly like this: <chat_title>Title here</chat_title> — then continue with your normal answer. The tag must appear before any other text and must not be mentioned anywhere else.</chat_title_request>";
  } else if (opts.generateBrief) {
    prompt +=
      "\n\n<chat_brief_request>This is the first message of a new conversation. Begin your reply with one sentence of at most 20 words on what this conversation is about, in the SAME language as the user's message, wrapped exactly like this: <chat_brief>Sentence here</chat_brief> — then continue with your normal answer. The tag must appear before any other text and must not be mentioned anywhere else.</chat_brief_request>";
  }

  const files = opts.projectFilesBlock.trim();
  if (files) {
    prompt +=
      "\n\n<project_files>\nFiles from this project's Library that the user added, picked for this message. Use them as source material and say which file you rely on when it matters.\n" +
      files +
      "\n</project_files>";
  }

  const skills = opts.skillsBlock.trim();
  if (skills) {
    prompt +=
      "\n\n<user_skills>\nSkills the user saved, picked for this message: their own instructions for this kind of task. Follow them.\n" +
      skills +
      "\n</user_skills>";
  }

  const memory = opts.memoryBlock.trim();
  if (memory && opts.memoryScope === "project") {
    prompt +=
      "\n\n<project_memory>\nThis project's memory: what its chats built up about the work. Files in the category \"You\" come from the user's own memory. Use it as context when relevant; do not recite it unprompted.\n" +
      memory +
      "\n</project_memory>";
  } else if (memory) {
    prompt +=
      "\n\n<user_memory>\nLong-term memory about this user, organized into files by the Advanced Memory System. Use it as context when relevant; do not recite it unprompted.\n" +
      memory +
      "\n</user_memory>";
  }

  // Date and model go at the end: both change mid-conversation, and higher up they would invalidate the prefix cache.
  prompt +=
    "\n\n<current_model>" +
    opts.providerModelID +
    ", served by " +
    PROVIDERS[opts.provider].name +
    "</current_model>";
  prompt += "\n\n<current_datetime>" + currentDatetimeForPrompt() + "</current_datetime>";
  return prompt;
}

// Rounded down to the hour: minute precision would change the prompt prefix on every message and defeat the history cache.
function currentDatetimeForPrompt(): string {
  const hour = new Date();
  hour.setMinutes(0, 0, 0);
  return hour.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export interface ModelTurn {
  role: "user" | "assistant";
  content: string;

  images?: string[];
}

export interface E2EStreamResult {

  text: string;
  // Helper-phase blocks, emitted before the answer. Whoever saves the message must append them to its content, or the Processing section vanishes after save.
  phaseBlocks: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

export interface E2EStreamOptions {

  provider: ProviderId;
  model: string;
  turns: ModelTurn[];
  projectContext: string;
  memoryFiles: MemoryFileForChat[];
  // Already narrowed to what this chat may use (a project's picks, none in incognito).
  skills?: SkillForChat[];
  customInstructions: string;

  conversationSummary: string;
  generateTitle: boolean;
  webSearch: boolean;
  reasoningEffort?: ReasoningEffort | null;
  onSearch?: (query: string) => void;
  // Memory writes happen on send only: a retry answers a message whose write already happened.
  memoryWrites?: boolean;
  applyMemoryEdit?: (edit: LiveMemoryEdit) => Promise<boolean>;
  connectors?: boolean;
  project?: {
    files: LibraryIndexEntry[];
    read: (ids: string[]) => Promise<Map<string, string>>;
    connectorIds: string[];
  };

  generateBrief?: boolean;
  signal?: AbortSignal;
}

// Never throws: a failed memory write must not stop the answer. If the stream fails after the edit is saved, the next send repairs the gap.
async function resolveMemoryWrite(
  opts: E2EStreamOptions,
  helperTurn: HelperTurn,
  request: MemoryWriteRequest,
  lastUserMessage: string
): Promise<string> {
  const file = request.fileId ? opts.memoryFiles.find((f) => f.id === request.fileId && !f.readOnly) : undefined;

  if (!file) {
    return encodeMemoryWriteBlock({ action: "proposal", file_id: null, category: null, file: null, text: request.note });
  }

  let decision;
  try {
    decision = await decideMemoryWrite(helperTurn, file, lastUserMessage, request);
  } catch {
    return "";
  }
  if (!decision) return "";

  const target = { file_id: file.id, category: file.category, file: file.name };

  if (decision.kind === "edit") {
    const saved = opts.applyMemoryEdit
      ? await opts
          .applyMemoryEdit({ fileId: file.id, name: file.name, description: decision.description, content: decision.content, updatedAt: file.updatedAt })
          .catch(() => false)
      : false;
    if (saved) return encodeMemoryWriteBlock({ action: "edit", ...target, text: decision.summary });
    return encodeMemoryWriteBlock({ action: "proposal", ...target, text: request.note });
  }

  return encodeMemoryWriteBlock({ action: "proposal", ...target, text: decision.text });
}

// No fallback to another provider: a failure, including a failed attestation, is shown as itself. A fallback would let the server steer plaintext to a key of its choosing.
const LIBRARY_WHOLE_SHARE = 0.25;
const LIBRARY_PROMPT_SHARE = 0.4;
const SKILLS_PROMPT_SHARE = 0.25;

export async function streamE2EChat(
  opts: E2EStreamOptions,
  onToken: (token: string) => void
): Promise<E2EStreamResult> {
  const lastUserMessage = [...opts.turns].reverse().find((t) => t.role === "user")?.content ?? "";

  const tier = getUser()?.tier ?? "free";
  const modelInfoRequest = fetchModelInfo(opts.model, opts.provider);
  // Translate the thinking level here: on this path the backend never builds the request, so its buildReasoning never runs.
  const reasoningParams = buildReasoningParams(opts.model, opts.provider, opts.reasoningEffort ?? null);
  const helperTurn = helperTurnFor(opts.model, opts.provider, async () => ({
    providerModelID: (await modelInfoRequest).providerModelID,
    reasoningParams,
  }));
  const library = opts.project?.files ?? [];
  const skills = opts.skills ?? [];
  let sendWholeLibrary = false;
  if (library.length > 0) {
    const budget = contextBudget(tier, (await modelInfoRequest).contextWindow, "");

    sendWholeLibrary = library.reduce((n, f) => n + f.size, 0) / 4 <= budget * LIBRARY_WHOLE_SHARE;
  }
  const modelInfo = await modelInfoRequest;
  const enclaveModelID = modelInfo.providerModelID;

  // If the memory phase did not run, say so in a notice rather than answering quietly without memory.
  // No suggestion of another provider, on purpose: the helper sees the memory index, so moving it would widen who sees the data.
  let phaseBlocks = "";
  const emitPhaseBlock = (block: string) => {
    phaseBlocks += block;
    onToken(block);
  };

  const providerName = PROVIDERS[opts.provider]?.name ?? opts.provider;
  const libraryContents = new Map<string, string>();
  const attemptedFiles = new Set<string>();
  const emittedSkills = new Set<string>();
  const emptySelection: MemorySelection = { block: "", skipped: false, memoryIds: [], libraryIds: [], skillIds: [] };

  const messagesFor = async (memory: MemorySelection): Promise<ModelMessage[]> => {
    let projectFilesBlock = "";
    const picked = sendWholeLibrary ? library : library.filter((f) => memory.libraryIds.includes(f.id));
    if (opts.project && picked.length > 0) {
      const unread = picked.filter((f) => !attemptedFiles.has(f.id));
      unread.forEach((f) => attemptedFiles.add(f.id));
      if (unread.length > 0) {
        try {
          const contents = await opts.project.read(unread.map((f) => f.id));
          contents.forEach((content, id) => libraryContents.set(id, content));
          const paths = unread.filter((f) => contents.has(f.id)).map((f) => f.path);
          if (paths.length > 0) emitPhaseBlock(`<library>${blockJSON({ paths })}</library>`);
        } catch {
        }
      }
      projectFilesBlock = libraryBlock(picked, libraryContents, contextBudget(tier, modelInfo.contextWindow, "") * LIBRARY_PROMPT_SHARE);
    }

    const pickedSkills = skills.filter((s) => memory.skillIds.includes(s.id));
    const used = skillsPromptBlock(pickedSkills, contextBudget(tier, modelInfo.contextWindow, "") * SKILLS_PROMPT_SHARE);
    const newNames = used.names.filter((name) => !emittedSkills.has(name));
    if (newNames.length > 0) {
      newNames.forEach((name) => emittedSkills.add(name));
      emitPhaseBlock(`<skills_used>${blockJSON({ names: newNames })}</skills_used>`);
    }

    const systemPrompt = await buildSystemPrompt({
      projectContext: opts.projectContext,
      conversationSummary: opts.conversationSummary,
      memoryBlock: memory.block,
      memoryScope: opts.project ? "project" : "user",
      projectFilesBlock,
      skillsBlock: used.block,
      customInstructions: opts.customInstructions,
      generateTitle: opts.generateTitle,
      generateBrief: Boolean(opts.generateBrief),
      webSearch: opts.webSearch,
      provider: opts.provider,
      providerModelID: enclaveModelID,
    });

    const budget = contextBudget(tier, modelInfo.contextWindow, systemPrompt);
    const turns = trimTurns(opts.turns, budget).map((turn): ModelMessage => ({
        role: turn.role,
        content: turn.images?.length ? [
          { type: "text", text: turn.content },
          ...turn.images.map((url) => ({ type: "image_url", image_url: { url } })),
        ] : turn.content,
      }));
    return [{ role: "system", content: systemPrompt }, ...turns];
  };

  let memoryWriteHandled = false;
  const preparation = await runPreparationPhase(helperTurn, {
    messages: await messagesFor(emptySelection),
    files: opts.memoryFiles,
    library: sendWholeLibrary ? [] : library,
    skills,
    allowWrites: Boolean(opts.memoryWrites) && (opts.memoryFiles.length > 0 || (!sendWholeLibrary && library.length > 0) || skills.length > 0),
    webSearch: opts.webSearch,
    onToken: emitPhaseBlock,
    onSearch: opts.onSearch ?? (() => {}),
    loadSelection: async (selection) => {
      if (opts.memoryWrites && selection.writeRequest && !memoryWriteHandled) {
        memoryWriteHandled = true;
        const block = await resolveMemoryWrite(opts, helperTurn, selection.writeRequest, lastUserMessage);
        if (block) emitPhaseBlock(block);
      }
      return messagesFor(selection);
    },
  });
  const memory = preparation.selection;
  const memoryOffered = opts.memoryFiles.length > 0 || (!sendWholeLibrary && library.length > 0);
  if (memory.skipped && memoryOffered) {
    emitPhaseBlock(`<notice>${blockJSON({ kind: "memory_skipped", reason: "model_unavailable", provider: opts.provider, provider_name: providerName, e2e: true })}</notice>`);
  } else if (memory.failed && memoryOffered) {
    emitPhaseBlock(`<notice>${blockJSON({ kind: "memory_skipped", reason: "decision" })}</notice>`);
  }
  if (skills.length > 0 && (memory.skipped || memory.failed)) {
    emitPhaseBlock(`<notice>${blockJSON({ kind: "skills_skipped", reason: memory.skipped ? "model_unavailable" : "decision", provider_name: providerName })}</notice>`);
  }
  const messages = [...await messagesFor(memory), ...preparation.messages];

  if (opts.connectors !== false) {
    messages.push(...(await runConnectorPhase(helperTurn, messages, emitPhaseBlock, preparation.searched, opts.project?.connectorIds)));
  }

  if (opts.signal?.aborted) throw new StoppedError();

  const stream = opts.provider === "nearai" ? streamNearAIChat : streamPhalaChat;
  const result = await stream({ providerModelID: enclaveModelID, turns: messages, reasoningParams, signal: opts.signal }, onToken);
  return { ...result, phaseBlocks };
}
