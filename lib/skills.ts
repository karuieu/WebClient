// Skills: This module must not import ./chat (chat.ts imports it).

import { apiJSON } from "./api";
import { tagAttr } from "./artifacts";
import { estimateTokens } from "./context";
import { decryptField, encryptField, fieldAad, type FieldKind } from "./crypto";
import { requireAesKey } from "./session";

export const SKILL_LIMITS = { name: 64, description: 200, content: 12_000 } as const;
// Counted in the browser only: the chat model reads the whole index on every message and the user's own plan pays for it.
export const SKILL_COUNT_LIMIT = { free: 10, pro: 100 } as const;
export const SKILLS_UPDATED_EVENT = "karui-skills-updated";

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  updatedAt: string;
}

export type SkillFields = Pick<Skill, "name" | "description" | "content">;
export type SkillForChat = Pick<Skill, "id" | "name" | "description" | "content">;

interface RawSkill {
  id: string;
  encrypted_name: string;
  encrypted_description: string;
  encrypted_content: string;
  enabled: boolean;
  updated_at: string;
}

async function decryptSkill(key: CryptoKey, raw: RawSkill): Promise<Skill> {
  const open = (value: string, kind: FieldKind) => decryptField(key, value, fieldAad(kind, raw.id)).catch(() => "");
  const [name, description, content] = await Promise.all([
    open(raw.encrypted_name, "skill-name"),
    open(raw.encrypted_description, "skill-description"),
    open(raw.encrypted_content, "skill-content"),
  ]);
  return { id: raw.id, name, description, content, enabled: raw.enabled, updatedAt: raw.updated_at };
}

async function encryptFields(key: CryptoKey, id: string, fields: SkillFields) {
  const [name, description, content] = await Promise.all([
    encryptField(key, fields.name, fieldAad("skill-name", id)),
    encryptField(key, fields.description, fieldAad("skill-description", id)),
    encryptField(key, fields.content, fieldAad("skill-content", id)),
  ]);
  return { encrypted_name: name, encrypted_description: description, encrypted_content: content };
}

function announce(): void {
  window.dispatchEvent(new Event(SKILLS_UPDATED_EVENT));
}

export async function listSkills(): Promise<Skill[]> {
  const key = await requireAesKey();
  const raw = await apiJSON<RawSkill[]>("/api/skills");
  const skills = await Promise.all(raw.map((r) => decryptSkill(key, r)));
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSkill(fields: SkillFields): Promise<Skill> {
  const key = await requireAesKey();
  const id = crypto.randomUUID();
  const raw = await apiJSON<RawSkill>("/api/skills", {
    method: "POST",
    body: JSON.stringify({ id, ...(await encryptFields(key, id, fields)) }),
  });
  announce();
  return decryptSkill(key, raw);
}

/** `expectedUpdatedAt` is sent back verbatim: a Date would drop the microseconds the server compares. */
export async function updateSkill(id: string, fields: SkillFields, expectedUpdatedAt?: string): Promise<Skill> {
  const key = await requireAesKey();
  const raw = await apiJSON<RawSkill>(`/api/skills/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...(await encryptFields(key, id, fields)), expected_updated_at: expectedUpdatedAt }),
  });
  announce();
  return decryptSkill(key, raw);
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<Skill> {
  const key = await requireAesKey();
  const raw = await apiJSON<RawSkill>(`/api/skills/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
  announce();
  return decryptSkill(key, raw);
}

export async function deleteSkill(id: string): Promise<void> {
  await apiJSON<void>(`/api/skills/${id}`, { method: "DELETE" });
  announce();
}

/**
 * The skills a chat may use: every enabled one, or in a project only those its settings allow. A failed load
 * gives none, so the answer never waits on skills.
 */
export async function getSkillsForChat(allowedIds?: string[]): Promise<SkillForChat[]> {
  if (allowedIds?.length === 0) return [];
  try {
    const skills = await listSkills();
    return skills
      .filter((s) => s.enabled && s.name && s.content && (!allowedIds || allowedIds.includes(s.id)))
      .map(({ id, name, description, content }) => ({ id, name, description, content }));
  } catch {
    return [];
  }
}

function sameSkillName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function skillFits(fields: SkillFields): boolean {
  return (
    fields.name.length <= SKILL_LIMITS.name &&
    fields.description.length <= SKILL_LIMITS.description &&
    fields.content.length <= SKILL_LIMITS.content
  );
}

/** Whole skills only, in order: one cut short would be followed half-way. */
export function skillsPromptBlock(skills: SkillForChat[], tokenCap: number): { block: string; names: string[] } {
  const parts: string[] = [];
  const names: string[] = [];
  let left = tokenCap;
  for (const s of skills) {
    const part = `<saved_skill name=${JSON.stringify(s.name)}>\n${s.content}\n</saved_skill>`;
    const tokens = estimateTokens(part);
    if (tokens > left) continue;
    left -= tokens;
    parts.push(part);
    names.push(s.name);
  }
  return { block: parts.join("\n"), names };
}

export interface SkillDraft extends SkillFields {
  streaming?: boolean;
}

const SKILL_BLOCK = /<skill\b([^>]*)>([\s\S]*?)<\/skill>/g;
// Not followed by a word character, so a tag such as <skills_used> never reads as an opening.
const OPEN_TAG = /<skill(?!\w)/;

function draftOf(rawAttrs: string, inner: string): SkillDraft {
  return { name: tagAttr(rawAttrs, "name"), description: tagAttr(rawAttrs, "description"), content: inner.trim() };
}

/** Skills the model wrote in its answer. Run it on the answer alone, so a draft the model only thought about stays hidden. */
export function parseSkillDrafts(answer: string): { drafts: SkillDraft[]; text: string } {
  const drafts: SkillDraft[] = [];
  let text = answer.replace(SKILL_BLOCK, (_, rawAttrs: string, inner: string) => {
    const draft = draftOf(rawAttrs, inner);
    if (draft.name && draft.content) drafts.push(draft);
    return "";
  });

  const open = OPEN_TAG.exec(text);
  if (open) {
    const rest = text.slice(open.index);
    const gt = rest.indexOf(">");
    // Even an incomplete opening tag is hidden before its name is known.
    drafts.push({ ...draftOf(gt === -1 ? "" : rest.slice(0, gt), gt === -1 ? "" : rest.slice(gt + 1)), streaming: true });
    text = text.slice(0, open.index);
  }
  return { drafts, text: text.trim() };
}

type DraftStatus = "new" | "update" | "saved";

export function draftStatus(draft: SkillFields, skills: Skill[]): { status: DraftStatus; existing?: Skill } {
  const existing = skills.find((s) => sameSkillName(s.name, draft.name));
  if (!existing) return { status: "new" };
  const same = existing.description === draft.description && existing.content === draft.content;
  return { status: same ? "saved" : "update", existing };
}
