// Skills: This module must not import ./chat (chat.ts imports it).

import { apiJSON } from "@/lib/core/api";
import { tagAttr } from "@/lib/artifacts/artifacts";
import { estimateTokens } from "@/lib/messages/context";
import { decryptField, encryptField, fieldAad, type FieldKind } from "@/lib/account/crypto";
import { requireAesKey } from "@/lib/account/session";

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
/** "karui" skills ship with the server, the same for everyone; "user" skills are the user's own. */
export type SkillSource = "user" | "karui";
export type SkillForChat = Pick<Skill, "id" | "name" | "description" | "content"> & { source: SkillSource };

/** "always" skills hold parts of how Karui answers (formats the app expects), so they can't be removed. */
export interface KaruiSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  install: "always" | "default" | "optional";
}

export interface KaruiSkillState extends KaruiSkill {
  installed: boolean;
}

/** Only the user's departures from each skill's default; version is the server's updated_at, null before the first save. */
interface KaruiChoices {
  installed: Record<string, boolean>;
  version: string | null;
}

interface RawKaruiChoices {
  encrypted_choices: string;
  updated_at: string | null;
}

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

function isChoices(value: unknown): value is Record<string, boolean> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "boolean");
}

async function loadKaruiChoices(key: CryptoKey): Promise<KaruiChoices> {
  const raw = await apiJSON<RawKaruiChoices>("/api/skills/karui/choices");
  if (!raw.updated_at) return { installed: {}, version: null };
  const parsed: unknown = JSON.parse(await decryptField(key, raw.encrypted_choices, fieldAad("karui-skill-choices")));
  if (!isChoices(parsed)) throw new Error("Saved Karui skill choices are not in the expected shape.");
  return { installed: parsed, version: raw.updated_at };
}

function isInstalled(skill: KaruiSkill, installed: Record<string, boolean>): boolean {
  return skill.install === "always" || (installed[skill.id] ?? skill.install === "default");
}

export async function listKaruiSkills(): Promise<KaruiSkillState[]> {
  const key = await requireAesKey();
  const [catalog, choices] = await Promise.all([apiJSON<KaruiSkill[]>("/api/skills/karui"), loadKaruiChoices(key)]);
  return catalog.map((s) => ({ ...s, installed: isInstalled(s, choices.installed) }));
}

/** Reads the latest choices right before writing; a save from another device in between is rejected (409), not overwritten. */
export async function setKaruiSkillInstalled(id: string, installed: boolean): Promise<void> {
  const key = await requireAesKey();
  const choices = await loadKaruiChoices(key);
  const next = JSON.stringify({ ...choices.installed, [id]: installed });
  await apiJSON<RawKaruiChoices>("/api/skills/karui/choices", {
    method: "PUT",
    body: JSON.stringify({
      encrypted_choices: await encryptField(key, next, fieldAad("karui-skill-choices")),
      expected_updated_at: choices.version,
    }),
  });
  announce();
}

async function userSkillsForChat(allowedIds?: string[]): Promise<SkillForChat[]> {
  if (allowedIds?.length === 0) return [];
  const skills = await listSkills();
  return skills
    .filter((s) => s.enabled && s.name && s.content && (!allowedIds || allowedIds.includes(s.id)))
    .map(({ id, name, description, content }) => ({ id, name, description, content, source: "user" }));
}

// Karui's skills carry formats the system prompt points to, so a chat still gets the defaults when the user's choices can't be read.
async function karuiSkillsForChat(): Promise<SkillForChat[]> {
  const key = await requireAesKey();
  const [catalog, installed] = await Promise.all([
    apiJSON<KaruiSkill[]>("/api/skills/karui"),
    loadKaruiChoices(key).then(
      (c) => c.installed,
      () => ({}),
    ),
  ]);
  return catalog
    .filter((s) => isInstalled(s, installed))
    .map(({ id, name, description, content }) => ({ id, name, description, content, source: "karui" }));
}

/**
 * The skills a chat may use: the user's enabled ones (in a project only those its settings allow) and the Karui skills
 * they have. Explicit selections require a successful load so a failure cannot silently omit their instructions.
 */
export async function getSkillsForChat(allowedIds?: string[], mode: "optional" | "required" = "optional"): Promise<SkillForChat[]> {
  const onFailure = (error: unknown): SkillForChat[] => {
    if (mode === "required") throw error;
    return [];
  };
  const [user, karui] = await Promise.all([userSkillsForChat(allowedIds).catch(onFailure), karuiSkillsForChat().catch(onFailure)]);
  return [...user, ...karui];
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
    const tag = s.source === "karui" ? "karui_skill" : "saved_skill";
    const part = `<${tag} name=${JSON.stringify(s.name)}>\n${s.content}\n</${tag}>`;
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
