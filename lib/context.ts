// Trims history in the browser before encryption, since the backend cannot read it. Billing uses only provider-reported usage.

const FREE_CONTEXT_TOKEN_LIMIT = 16_000;

const PRO_CONTEXT_TOKEN_LIMIT = 128_000;

const OUTPUT_RESERVE = 32_000;

/** Estimate images at a fixed token cost instead of counting their base64 data URLs as text. */
const TOKENS_PER_IMAGE = 1_200;

/**
 * Estimate ASCII at four characters per token and non-ASCII at one; this is a conservative heuristic, not
 * tokenization.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const char of text) {
    if (char.codePointAt(0)! < 128) ascii++;
    else wide++;
  }
  if (ascii === 0 && wide === 0) return 0;
  return Math.ceil(ascii / 4) + wide;
}

export function tokenLimitForTier(tier: string): number {
  return tier.trim().toLowerCase() === "pro"
    ? PRO_CONTEXT_TOKEN_LIMIT
    : FREE_CONTEXT_TOKEN_LIMIT;
}

export function contextBudget(
  tier: string,
  contextWindow: number,
  systemPrompt: string
): number {
  let budget = tokenLimitForTier(tier);
  if (contextWindow > 0) {
    budget = Math.min(budget, contextWindow - OUTPUT_RESERVE);
  }
  return Math.max(0, budget - estimateTokens(systemPrompt));
}

export interface TrimmableTurn {
  role: string;
  content: string;
  images?: string[];
}

function turnTokens(turn: TrimmableTurn): number {
  return (
    estimateTokens(turn.content) +
    estimateTokens(turn.role) +
    (turn.images?.length ?? 0) * TOKENS_PER_IMAGE
  );
}

/** Trim history only; the system prompt is added later. Always keep the latest turn, even if it exceeds the budget. */
export function trimTurns<T extends TrimmableTurn>(turns: T[], tokenBudget: number): T[] {
  if (turns.length <= 1) return turns;

  let total = 0;
  for (const turn of turns) total += turnTokens(turn);

  let dropIndex = 0;
  while (total > tokenBudget && dropIndex < turns.length - 1) {
    total -= turnTokens(turns[dropIndex]);
    dropIndex++;
  }

  return dropIndex === 0 ? turns : turns.slice(dropIndex);
}
