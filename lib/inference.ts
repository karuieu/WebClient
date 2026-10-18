// Inference for the E2E path. The browser builds the whole request (prompt, memory, search results) and encrypts messages to the attested enclave of the turn's provider; the backend only proxies ciphertext.
// The chat's own model answers and calls tools itself (answerTools.ts); the smaller helper model only merges memory notes (helperPhases.ts).

import { getUser, onSessionCleared } from "./session";
import { getArtifactsEnabled } from "./artifacts";
import { PROVIDERS, type ProviderId } from "./providers";
import { type LiveMemoryEdit, type MemoryFileForChat } from "./memory";
import { encodeMemoryWriteBlock } from "./memoryWrite";
import { blockJSON, parseMessageBlocks, STOPPED_NOTICE } from "./messageBlocks";
import {
  decideMemoryWrite,
  helperReasoningParams,
  type HelperModel,
  type HelperTurn,
  type MemoryWriteRequest,
  type ModelMessage,
} from "./helperPhases";
import {
  answerStatusBlock,
  answerToolsBlock,
  callTags,
  contextAliases,
  loadConnectorTools,
  memoryBlock,
  parseMemoryNote,
  runAnswerCall,
  startAnswerRound,
  type AnswerActivity,
  type AnswerCallContext,
  type AnswerRound,
  type ConnectorTool,
  type ContextIndex,
  type LibraryIndexEntry,
} from "./answerTools";
import { buildReasoningParams, type ReasoningEffort } from "./reasoning";
import { StoppedError, throwIfStopped } from "./errors";
import { contextBudget, trimTurns } from "./context";
import { libraryBlock } from "./projectFiles";
import { skillsPromptBlock, type SkillForChat } from "./skills";
import { isNearAIVerified, streamNearAIChat } from "./nearaiClient";
import { isPhalaVerified, streamPhalaChat } from "./phalaClient";
import { API_URL, apiFetch } from "./api";
import { fetchSystemPrompt } from "./systemPrompt";
import {
  MEMORY_NOTE_CLOSE,
  MEMORY_NOTE_OPEN,
  callIndex,
  createCallFilter,
  createTagFilter,
  stripMemoryNotes,
  stripTitleBlock,
  type AnswerCall,
} from "./streamTags";

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

async function loadModelCatalog(fresh = false): Promise<Record<string, CachedModel>> {
  if (!modelCatalog || fresh) {
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
  provider: ProviderId,
  fresh = false
): Promise<{ providerModelID: string; contextWindow: number }> {
  const catalog = await loadModelCatalog(fresh);
  const entry = catalog[modelId];
  const resolved = entry?.providerModelIDs[provider];
  if (!resolved) throw new Error("This model isn't available right now. Choose another one.");
  return { providerModelID: resolved, contextWindow: entry.contextWindow };
}

// The backend leaves models and providers an admin turned off out of /api/ai/models, so a fresh copy
// stops a turn before a chat is created or an enclave is verified.
export async function ensureModelAvailable(modelId: string, provider: ProviderId): Promise<void> {
  await fetchModelInfo(modelId, provider, true);
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
  toolsBlock: string;
  statusBlock: string;
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
      "\n\n<web_search_status>Web search is currently DISABLED by the user. Do NOT try to search or to read web pages. If the user asks something that clearly needs current information or a page they linked, tell them to turn on web search.</web_search_status>";
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

  prompt += opts.toolsBlock;

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

  // Changes with every answer round, so it sits below memory.
  prompt += opts.statusBlock;

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
  // The answer with every block it put on screen (searches, files, skills, tools, memory) in stream order. Whoever saves the message saves exactly this.
  text: string;
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
  onActivity?: (activity: AnswerActivity) => void;
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

// Never throws, except on Stop: a failed memory write must not cost the answer.
async function resolveMemoryWrite(opts: E2EStreamOptions, model: HelperModel, request: MemoryWriteRequest): Promise<string> {
  throwIfStopped(opts.signal);
  const file = request.fileId ? opts.memoryFiles.find((f) => f.id === request.fileId && !f.readOnly) : undefined;

  if (!file) {
    return encodeMemoryWriteBlock({ action: "proposal", file_id: null, category: null, file: null, text: request.note });
  }

  const helperTurn: HelperTurn = { provider: opts.provider, main: async () => model, signal: opts.signal };
  const lastUserMessage = [...opts.turns].reverse().find((t) => t.role === "user")?.content ?? "";
  let decision;
  try {
    decision = await decideMemoryWrite(helperTurn, file, lastUserMessage, request);
  } catch (error) {
    if (error instanceof StoppedError) throw error;
    return "";
  }
  throwIfStopped(opts.signal);
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

const LIBRARY_WHOLE_SHARE = 0.25;
const LIBRARY_PROMPT_SHARE = 0.4;
const SKILLS_PROMPT_SHARE = 0.25;
const MEMORY_NOTE_MAX_CHARS = 1000;
const MAX_ANSWER_ROUNDS = 6;

interface AnswerTurn {
  model: HelperModel;
  call: Omit<AnswerCallContext, "emit">;
  buildMessages: (round: AnswerRound, emit: (block: string) => void) => Promise<ModelMessage[]>;
}

// No fallback to another provider: a failure, including a failed attestation, is shown as itself. A fallback would let the server steer plaintext to a key of its choosing.
export async function streamE2EChat(
  opts: E2EStreamOptions,
  onToken: (token: string) => void
): Promise<E2EStreamResult> {
  throwIfStopped(opts.signal);
  const tier = getUser()?.tier ?? "free";
  const [modelInfo, connectorTools] = await Promise.all([
    fetchModelInfo(opts.model, opts.provider, true),
    opts.connectors === false ? new Map<string, ConnectorTool>() : loadConnectorTools(opts.project?.connectorIds),
  ]);
  throwIfStopped(opts.signal);
  const budget = contextBudget(tier, modelInfo.contextWindow, "");
  const library = opts.project?.files ?? [];
  const skills = opts.skills ?? [];
  const sendWholeLibrary = library.reduce((n, f) => n + f.size, 0) / 4 <= budget * LIBRARY_WHOLE_SHARE;
  const index: ContextIndex = { memory: opts.memoryFiles, library: sendWholeLibrary ? [] : library, skills };
  const aliases = contextAliases(index);
  const toolsBlock = answerToolsBlock(index, connectorTools, Boolean(opts.memoryWrites));

  const libraryContents = new Map<string, string>();
  const attemptedFiles = new Set<string>();
  const emittedSkills = new Set<string>();

  const projectFilesBlock = async (round: AnswerRound, emit: (block: string) => void): Promise<string> => {
    const picked = sendWholeLibrary ? library : library.filter((f) => round.selection.libraryIds.includes(f.id));
    if (!opts.project || picked.length === 0) return "";
    const unread = picked.filter((f) => !attemptedFiles.has(f.id));
    unread.forEach((f) => attemptedFiles.add(f.id));
    if (unread.length > 0) {
      try {
        const contents = await opts.project.read(unread.map((f) => f.id));
        contents.forEach((content, id) => libraryContents.set(id, content));
        const paths = unread.filter((f) => contents.has(f.id)).map((f) => f.path);
        if (paths.length > 0) emit(`<library>${blockJSON({ paths })}</library>`);
      } catch {
      }
      throwIfStopped(opts.signal);
    }
    return libraryBlock(picked, libraryContents, budget * LIBRARY_PROMPT_SHARE);
  };

  const skillsBlock = (round: AnswerRound, emit: (block: string) => void): string => {
    const used = skillsPromptBlock(skills.filter((s) => round.selection.skillIds.includes(s.id)), budget * SKILLS_PROMPT_SHARE);
    const newNames = used.names.filter((name) => !emittedSkills.has(name));
    if (newNames.length > 0) {
      newNames.forEach((name) => emittedSkills.add(name));
      emit(`<skills_used>${blockJSON({ names: newNames })}</skills_used>`);
    }
    return used.block;
  };

  const buildMessages = async (round: AnswerRound, emit: (block: string) => void): Promise<ModelMessage[]> => {
    throwIfStopped(opts.signal);
    const systemPrompt = await buildSystemPrompt({
      projectContext: opts.projectContext,
      conversationSummary: opts.conversationSummary,
      memoryBlock: memoryBlock(opts.memoryFiles, round.selection.memoryIds),
      memoryScope: opts.project ? "project" : "user",
      projectFilesBlock: await projectFilesBlock(round, emit),
      skillsBlock: skillsBlock(round, emit),
      customInstructions: opts.customInstructions,
      generateTitle: opts.generateTitle && !round.titleWritten,
      generateBrief: Boolean(opts.generateBrief) && !round.titleWritten,
      webSearch: opts.webSearch,
      toolsBlock,
      statusBlock: answerStatusBlock(round, { aliases, connectorTools }, opts.webSearch),
      provider: opts.provider,
      providerModelID: modelInfo.providerModelID,
    });
    throwIfStopped(opts.signal);
    const turns = trimTurns(opts.turns, contextBudget(tier, modelInfo.contextWindow, systemPrompt)).map((turn): ModelMessage => ({
      role: turn.role,
      content: turn.images?.length ? [
        { type: "text", text: turn.content },
        ...turn.images.map((url) => ({ type: "image_url", image_url: { url } })),
      ] : turn.content,
    }));
    return [{ role: "system", content: systemPrompt }, ...turns];
  };

  // Translate the thinking level here: on this path the backend never builds the request, so its buildReasoning never runs.
  const reasoningParams = buildReasoningParams(opts.model, opts.provider, opts.reasoningEffort ?? null);
  return streamAnswer(
    opts,
    {
      model: { providerModelID: modelInfo.providerModelID, reasoningParams },
      call: { aliases, connectorTools, onActivity: opts.onActivity ?? (() => {}), signal: opts.signal },
      buildMessages,
    },
    onToken
  );
}

// A call the model writes ends the round: it is cut from the stream, the app runs it, and the model continues with the result.
// The memory note doesn't end the round; it is cut from the stream and saved once the answer is complete.
async function streamAnswer(opts: E2EStreamOptions, turn: AnswerTurn, onToken: (token: string) => void): Promise<E2EStreamResult> {
  const stream = opts.provider === "nearai" ? streamNearAIChat : streamPhalaChat;
  const round = startAnswerRound(opts.webSearch);
  const followUps: ModelMessage[] = [];
  const total = { text: "", provider: opts.provider as string, inputTokens: 0, outputTokens: 0 };
  const memory: { note?: MemoryWriteRequest } = {};
  let pendingText = "";
  // Blocks go on screen and into the saved answer, in stream order.
  const emit = (block: string) => {
    total.text += block;
    onToken(block);
  };
  const ctx: AnswerCallContext = { ...turn.call, emit };

  try {
    for (let request = 0; request < MAX_ANSWER_ROUNDS; request++) {
      throwIfStopped(opts.signal);
      round.finalAnswer = request === MAX_ANSWER_ROUNDS - 1;
      const found: { call?: AnswerCall } = {};
      pendingText = "";
      const forward = (token: string) => {
        pendingText += token;
        onToken(token);
      };
      // Filtered even when writes are off: a note the model writes anyway must not show up.
      const noteFilter = createTagFilter(MEMORY_NOTE_OPEN, MEMORY_NOTE_CLOSE, forward, (value) => {
        if (opts.memoryWrites) memory.note ??= parseMemoryNote(value, ctx.aliases) ?? undefined;
      }, MEMORY_NOTE_MAX_CHARS);
      // The call filter goes first: it drops what follows a call, as the client cuts the text there.
      const tags = callTags(round, ctx);
      const callFilter = tags.length > 0 ? createCallFilter(tags, noteFilter.push, (call) => (found.call = call)) : null;
      const turns = [...await turn.buildMessages(round, emit), ...followUps];
      throwIfStopped(opts.signal);
      const result = await stream(
        {
          providerModelID: turn.model.providerModelID,
          turns,
          reasoningParams: turn.model.reasoningParams,
          signal: opts.signal,
          stopAt: callFilter ? (text) => (found.call === undefined ? -1 : callIndex(text, tags)) : undefined,
        },
        callFilter?.push ?? noteFilter.push
      );
      callFilter?.flush();
      noteFilter.flush();
      const text = stripMemoryNotes(result.text);
      total.text += text;
      pendingText = "";
      total.provider = result.provider;
      total.inputTokens += result.inputTokens;
      total.outputTokens += result.outputTokens;
      if (found.call === undefined) break;

      round.titleWritten ||= /<\/chat_(title|brief)>/.test(total.text);
      // Without its title and brief: seeing them at the start of its own reply, the model wrote them again.
      const partial = stripTitleBlock(text.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "")).trim();
      if (partial) followUps.push({ role: "assistant", content: partial });
      followUps.push({ role: "user", content: `${await runAnswerCall(found.call, round, ctx)}\n\nContinue your reply.` });
    }
  } catch (error) {
    if (!(error instanceof StoppedError)) throw error;
    total.text += pendingText;
    if (!parseMessageBlocks(stripTitleBlock(total.text)).answer.trim()) throw error;
    if (!total.text.includes(STOPPED_NOTICE)) emit(STOPPED_NOTICE);
    return total;
  }

  // The answer is complete, so Stop now only skips the write.
  if (memory.note) {
    const block = await resolveMemoryWrite(opts, turn.model, memory.note).catch((error: unknown) => {
      if (error instanceof StoppedError) return "";
      throw error;
    });
    if (block) emit(block);
  }
  return total;
}
