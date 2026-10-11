// Keep levels aligned with the backend's offerings, keyed by model and provider. Hide thinking controls when support is unconfirmed.

import { getModelProvider, type ProviderId } from "./providers";
import { accountSettingKey } from "./session";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

// GLM 5.3 and GLM 5.3 Flash, at both providers: the chat template reads "low" as about no thinking, "high" as a
// short thought, and anything else as "max", full thinking like sending no level (measured 2026-10-09). So the
// picker names them by effect: Off, Low, High. Real off (enable_thinking: false) makes GLM think inside the
// answer instead, so Off sends "low".
const GLM: ReasoningEffort[] = ["none", "low", "high"];
const GLM_TEMPLATE: Partial<Record<ReasoningEffort, string>> = { none: "low", low: "high", high: "max" };
// Qwen 3.8 27B: the template reads low, medium and xhigh and REJECTS any other
// value; "none" turns thinking off (enable_thinking: false).
const QWEN: ReasoningEffort[] = ["none", "low", "medium", "xhigh"];

export const REASONING_EFFORT_LEVELS: Record<
  string,
  Partial<Record<ProviderId, ReasoningEffort[]>>
> = {
  fast: { nearai: GLM },
  smart: { phala: GLM },
  "qwen3-8-27b": { nearai: QWEN, phala: QWEN },
};

// What a model's template is sent for a picker level; a model without an entry gets the level itself.
const TEMPLATE_EFFORT: Record<string, Partial<Record<ReasoningEffort, string>>> = {
  fast: GLM_TEMPLATE,
  smart: GLM_TEMPLATE,
};

export function templateEffort(modelId: string, effort: ReasoningEffort): string {
  return TEMPLATE_EFFORT[modelId]?.[effort] ?? effort;
}

// Dialect for thinking at a provider whose models read chat_template_kwargs instead of the top-level reasoning_effort. No entry means the top-level field.
const NEAR_KWARGS = { thinkingKey: "enable_thinking", effortInKwargs: true };

const REASONING_TEMPLATE_KWARGS: Record<
  string,
  Partial<Record<ProviderId, { thinkingKey: string; effortInKwargs: boolean }>>
> = {
  fast: { nearai: NEAR_KWARGS },
  "qwen3-8-27b": { nearai: NEAR_KWARGS },
};

export function buildReasoningParams(
  modelId: string,
  provider: ProviderId,
  effort: ReasoningEffort | null
): { reasoning_effort?: string; chat_template_kwargs?: Record<string, unknown> } {
  if (!effort) return {};
  const sent = templateEffort(modelId, effort);

  const dialect = REASONING_TEMPLATE_KWARGS[modelId]?.[provider];
  if (!dialect) return { reasoning_effort: sent };

  if (sent === "none") {
    return { chat_template_kwargs: { [dialect.thinkingKey]: false } };
  }

  const kwargs: Record<string, unknown> = { [dialect.thinkingKey]: true };
  if (dialect.effortInKwargs) {
    kwargs.reasoning_effort = sent;
    return { chat_template_kwargs: kwargs };
  }
  return { reasoning_effort: sent, chat_template_kwargs: kwargs };
}

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-High",
  max: "Max",
};

export function getReasoningLevelsFor(
  modelId: string,
  provider: ProviderId | null
): ReasoningEffort[] {
  if (!provider) return [];
  return REASONING_EFFORT_LEVELS[modelId]?.[provider] ?? [];
}

export function getReasoningLevelsForModel(modelId: string): ReasoningEffort[] {
  return getReasoningLevelsFor(modelId, getModelProvider(modelId));
}

const STORAGE_KEY = "karui_reasoning_effort";
const DEFAULT_EFFORT: ReasoningEffort = "medium";
const ORDER: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh", "max"];

function isReasoningEffort(v: string): v is ReasoningEffort {
  return (ORDER as string[]).includes(v);
}

export function getReasoningEffort(): ReasoningEffort {
  if (typeof window === "undefined") return DEFAULT_EFFORT;
  try {
    const raw = window.localStorage.getItem(accountSettingKey(STORAGE_KEY));
    if (raw && isReasoningEffort(raw)) return raw;
  } catch {}
  return DEFAULT_EFFORT;
}

export function setReasoningEffort(effort: ReasoningEffort | null): void {
  if (typeof window === "undefined") return;
  try {
    if (effort) window.localStorage.setItem(accountSettingKey(STORAGE_KEY), effort);
    else window.localStorage.removeItem(accountSettingKey(STORAGE_KEY));
  } catch {}
}

export function clampReasoningEffort(
  modelId: string,
  effort: ReasoningEffort | null
): ReasoningEffort | null {
  const levels = getReasoningLevelsForModel(modelId);
  if (levels.length === 0 || !effort) return null;
  if (levels.includes(effort)) return effort;
  const pool = levels.filter((l) => l !== "none");
  if (pool.length === 0) return levels[0];
  const at = ORDER.indexOf(effort);
  const distance = (l: ReasoningEffort) => Math.abs(ORDER.indexOf(l) - at);
  return pool.reduce((best, l) => (distance(l) <= distance(best) ? l : best));
}

export function resolveReasoningEffort(modelId: string): ReasoningEffort | null {
  return clampReasoningEffort(modelId, getReasoningEffort());
}
