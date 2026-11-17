import type { SkillForChat } from "@/lib/chat/skills";

export type SkillReference = Pick<SkillForChat, "id" | "source">;

export function parseSkillReference(value: unknown): SkillReference | undefined {
  if (!value || typeof value !== "object" || !("id" in value) || !("source" in value)) return undefined;
  if (typeof value.id !== "string" || !value.id || (value.source !== "user" && value.source !== "karui")) return undefined;
  return { id: value.id, source: value.source };
}

export function skillCommandName(name: string): string {
  return `/${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

export function insertSkillCommand(text: string, name: string, at: number): string {
  return (text.slice(0, at) + skillCommandName(name) + text.slice(at)).trim();
}
