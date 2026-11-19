import type { SkillForChat } from "@/lib/chat/skills";

// `at` is where the skill command starts in the message text; older messages have none.
export type SkillReference = Pick<SkillForChat, "id" | "source"> & { at?: number };

export function parseSkillReference(value: unknown): SkillReference | undefined {
  if (!value || typeof value !== "object" || !("id" in value) || !("source" in value)) return undefined;
  if (typeof value.id !== "string" || !value.id || (value.source !== "user" && value.source !== "karui")) return undefined;
  const at = "at" in value && Number.isInteger(value.at) && Number(value.at) >= 0 ? Number(value.at) : undefined;
  return { id: value.id, source: value.source, ...(at !== undefined ? { at } : {}) };
}

export function skillCommandName(name: string): string {
  return `/${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}
