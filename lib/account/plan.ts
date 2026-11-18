export type Plan = "free" | "pro" | "max";

export const PLAN_NAMES = { free: "Free", pro: "Pro", max: "Max" } as const;

export function planOf(tier: string | undefined): Plan {
  return tier === "pro" || tier === "max" ? tier : "free";
}

/** Paid plans share every feature and differ only in their usage limits. */
export function isPaidTier(tier: string | undefined): boolean {
  return planOf(tier) !== "free";
}
