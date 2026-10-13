// Compresses older history into an encrypted summary in the browser; the backend cannot read the content and only keeps the pool counter.

import { encryptField, fieldAad } from "./crypto";
import { estimateTokens } from "./context";
import { compressHistoryE2E, type CompressionTurn } from "./helperPhases";
import { getModelProvider } from "./providers";
import { chatModelAsHelper } from "./inference";
import { API_URL, apiFetch } from "./api";

// PRO threshold: a fraction of the context budget, kept below it so the summary can finish before the trimmer drops messages.
const COMPRESSION_THRESHOLD = 0.7;

// Absolute, not a fraction: Free's budget is far smaller. Keep this below the compression pool (billing.CompressionTokenLimit); above it the 429 arrives before compression can finish, switching it off on Free.
const FREE_COMPRESSION_THRESHOLD_TOKENS = 55_000;

// The most recent turns are never summarised: the model needs the last exchange verbatim.
const KEEP_VERBATIM_TURNS = 6;

// Target size after compression. Summarising down to this level stops compression from firing on every following message.
const COMPRESSION_TARGET = 0.4;

export type CompressionOutcome = "done" | "nothing" | "quota" | "unavailable";

export interface CompressionCandidate {

  toCompress: CompressionTurn[];
  lastIndex: number;
}

function turnTokens(turn: CompressionTurn): number {
  return estimateTokens(turn.content) + estimateTokens(turn.role);
}

export function selectForCompression(
  turns: CompressionTurn[],
  budget: number,
  tier: string
): CompressionCandidate | null {
  if (budget <= 0 || turns.length <= KEEP_VERBATIM_TURNS + 1) return null;

  let total = 0;
  for (const turn of turns) total += turnTokens(turn);

  const threshold =
    tier === "free" ? FREE_COMPRESSION_THRESHOLD_TOKENS : budget * COMPRESSION_THRESHOLD;
  if (total < threshold) return null;

  // Summarise from the oldest turn until the rest fits the target. The target always comes from the budget, also on Free.
  const target = budget * COMPRESSION_TARGET;
  const maxIndex = turns.length - KEEP_VERBATIM_TURNS;

  let remaining = total;
  let cut = 0;
  while (cut < maxIndex && remaining > target) {
    remaining -= turnTokens(turns[cut]);
    cut++;
  }

  if (cut === 0) return null;
  return { toCompress: turns.slice(0, cut), lastIndex: cut - 1 };
}

// Compression never runs in the background: once the threshold is passed, the chat is blocked until the user runs it.
export function compressionRequired(
  turns: CompressionTurn[],
  budget: number,
  tier: string
): boolean {
  return selectForCompression(turns, budget, tier) !== null;
}

export interface CompressionQuota {
  available: boolean;
  tokensUsed: number;
  tokensLimit: number;
  resetAt: Date | null;
}

// Asked directly rather than inferred from a failed attempt, since the gate must know before offering compression.
export async function getCompressionQuota(): Promise<CompressionQuota> {
  const response = await apiFetch(`${API_URL}/api/ai/compression-quota`);
  if (!response.ok) throw new Error(`Could not fetch the compression quota (${response.status})`);

  const data = (await response.json()) as {
    available?: boolean;
    tokens_used?: number;
    tokens_limit?: number;
    reset_at?: string;
  };
  const resetAt = data.reset_at ? new Date(data.reset_at) : null;
  return {
    // A missing field in a 200 response counts as allowed. A failed check does not close the gate: the backend enforces the real limit on the attempt itself.
    available: data.available ?? true,
    tokensUsed: data.tokens_used ?? 0,
    tokensLimit: data.tokens_limit ?? 0,
    resetAt: resetAt && !Number.isNaN(resetAt.getTime()) ? resetAt : null,
  };
}

// Cooldown after the pool runs out. Without it, every following message in a long chat would retry and get a 429.
const quotaCooldownUntil = new Map<string, number>();
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;

// Detected by status, falling back to the message text: the NEAR AI and Phala clients report the 429 differently.
function isQuotaExhausted(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "status" in error) {
    if ((error as { status?: unknown }).status === 429) return true;
  }
  return error instanceof Error && error.message.includes("429");
}

// Runs in the enclave of the provider serving this model, like the turn it belongs to.
async function runCompression(
  modelId: string,
  turns: CompressionTurn[],
  previousSummary: string
): Promise<string> {
  const provider = getModelProvider(modelId);
  if (!provider) throw new Error("Unknown model — no provider to ask for a summary");
  return compressHistoryE2E({ provider, main: chatModelAsHelper(modelId, provider) }, turns, previousSummary);
}

export async function saveChatSummary(
  key: CryptoKey,
  chatId: string,
  summary: string,
  upToMessageId: string
): Promise<void> {
  const encrypted_summary = summary
    ? await encryptField(key, summary, fieldAad("chat-summary", chatId, upToMessageId))
    : "";
  const response = await apiFetch(`${API_URL}/api/chats/${chatId}/summary`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      encrypted_summary,
      summary_up_to_message_id: summary ? upToMessageId : "",
    }),
  });
  if (!response.ok) throw new Error(`Saving the summary failed (${response.status})`);
}

export async function clearChatSummary(key: CryptoKey, chatId: string): Promise<void> {
  await saveChatSummary(key, chatId, "", "");
}

// Returns 'done', 'nothing', 'quota' or 'unavailable', so the gate's button never fails silently.
export async function maybeCompressChat(opts: {
  key: CryptoKey;
  chatId: string;
  modelId: string;
  turns: CompressionTurn[];
  messageIds: string[];
  previousSummary: string;
  budget: number;
  tier: string;
}): Promise<CompressionOutcome> {
  const cooldownUntil = quotaCooldownUntil.get(opts.chatId);
  if (cooldownUntil !== undefined && Date.now() < cooldownUntil) return "quota";

  const candidate = selectForCompression(opts.turns, opts.budget, opts.tier);
  if (!candidate) return "nothing";

  // Without the last covered message's ID the summary can't be invalidated later,
  // and a summary we can't invalidate is worse than none at all.
  const upToMessageId = opts.messageIds[candidate.lastIndex];
  if (!upToMessageId) return "nothing";

  let summary: string;
  try {
    summary = await runCompression(opts.modelId, candidate.toCompress, opts.previousSummary);
  } catch (error) {
    if (isQuotaExhausted(error)) {
      quotaCooldownUntil.set(opts.chatId, Date.now() + QUOTA_COOLDOWN_MS);
      return "quota";
    }
    throw error;
  }
  if (!summary) return "unavailable";

  quotaCooldownUntil.delete(opts.chatId);

  await saveChatSummary(opts.key, opts.chatId, summary, upToMessageId);
  return "done";
}
