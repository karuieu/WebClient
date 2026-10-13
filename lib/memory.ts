// Advanced Memory System: memory is organised into categories and files, all encrypted in the browser. The server holds ciphertext and cursors for processed chats. This module must not import ./chat (chat.ts imports it), so it has its own HTTP helpers.

import { accountSettingKey, ensureAesKey, getUser } from "./session";
import { decryptField, encryptField, fieldAad, messageAad, type FieldKind } from "./crypto";
import { parseMessageContent } from "./vision";
import {
  MEMORY_TRANSCRIPT_MAX_CHARS,
  organizeMemoryE2E,
  organizeProjectMemoryE2E,
  type MemoryOperation,
} from "./helperPhases";
import { annotateMemoryWrites } from "./memoryWrite";
import { API_URL, JSON_HEADERS, apiFetch } from "./api";
import { getProvider } from "./providers";
import {
  createProjectMemoryFile,
  deleteProjectMemoryFile,
  getProject,
  listProjectMemory,
  updateProjectMemoryFile,
  type ProjectMemoryFile,
  type ProjectSettings,
} from "./projects";

export interface MemorySettings {
  enabled: boolean;
  interval: number;
  auto: boolean;
  // Mid-conversation writes: explicit user requests are saved straight away, everything else is left as a proposal for the organising pass.
  liveWrites: boolean;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: false,
  interval: 10,
  auto: false,
  liveWrites: true,
};

const SETTINGS_KEY = "karui_memory_settings";

function normalizeSettings(raw: unknown): MemorySettings {
  const s = { ...DEFAULT_MEMORY_SETTINGS };
  if (raw && typeof raw === "object") {
    const r = raw as Partial<MemorySettings>;
    if (typeof r.enabled === "boolean") s.enabled = r.enabled;
    if (typeof r.interval === "number" && Number.isFinite(r.interval)) {
      s.interval = Math.min(100, Math.max(2, Math.round(r.interval)));
    }
    if (typeof r.auto === "boolean") s.auto = r.auto;
    if (typeof r.liveWrites === "boolean") s.liveWrites = r.liveWrites;
  }
  return s;
}

export function getMemorySettings(): MemorySettings {
  if (typeof window === "undefined") return { ...DEFAULT_MEMORY_SETTINGS };
  try {
    const raw = window.localStorage.getItem(accountSettingKey(SETTINGS_KEY));
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_MEMORY_SETTINGS };
  }
}

export function setMemorySettings(patch: Partial<MemorySettings>): MemorySettings {
  const next = normalizeSettings({ ...getMemorySettings(), ...patch });
  try {
    window.localStorage.setItem(accountSettingKey(SETTINGS_KEY), JSON.stringify(next));
  } catch {}
  return next;
}

async function requireAesKey(): Promise<CryptoKey> {
  const key = await ensureAesKey();
  if (!key) throw new Error("Encryption key unavailable — please sign in again.");
  return key;
}

async function apiCall<T>(endpoint: string, options: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...JSON_HEADERS, ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(
      (data as { error?: string }).error || `HTTP error ${response.status} ${response.statusText}`
    );
  }
  if (response.status === 204) return null as unknown as T;
  return response.json();
}

export interface MemoryFile {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  content: string;
  updatedAt: string;
  /** A field didn't open on this device (usually an older format); it reads as empty. */
  undecryptable?: boolean;
}

export interface MemoryCategory {
  id: string;
  name: string;
  updatedAt: string;
  files: MemoryFile[];
  /** The name didn't open on this device; it reads as empty. */
  undecryptable?: boolean;
}

interface RawFile {
  id: string;
  category_id: string;
  encrypted_name: string;
  encrypted_description: string;
  encrypted_content: string;
  created_at: string;
  updated_at: string;
}

interface RawCategory {
  id: string;
  encrypted_name: string;
  created_at: string;
  updated_at: string;
  files: RawFile[];
}

async function decryptFile(key: CryptoKey, raw: RawFile): Promise<MemoryFile> {
  let undecryptable = false;
  const open = (cipher: string | null | undefined, kind: FieldKind) =>
    cipher
      ? decryptField(key, cipher, fieldAad(kind, raw.id)).catch(() => {
          undecryptable = true;
          return "";
        })
      : Promise.resolve("");
  const [name, description, content] = await Promise.all([
    open(raw.encrypted_name, "memory-file-name"),
    open(raw.encrypted_description, "memory-file-description"),
    open(raw.encrypted_content, "memory-file-content"),
  ]);
  const file: MemoryFile = { id: raw.id, categoryId: raw.category_id, name, description, content, updatedAt: raw.updated_at };
  if (undecryptable) file.undecryptable = true;
  return file;
}

async function decryptCategory(key: CryptoKey, raw: RawCategory): Promise<MemoryCategory> {
  let undecryptable = false;
  const name = await decryptField(key, raw.encrypted_name, fieldAad("memory-category", raw.id)).catch(() => {
    undecryptable = true;
    return "";
  });
  const files = await Promise.all((raw.files ?? []).map((f) => decryptFile(key, f)));
  const category: MemoryCategory = { id: raw.id, name, updatedAt: raw.updated_at, files };
  if (undecryptable) category.undecryptable = true;
  return category;
}

// Concurrent callers on a fresh account would each seed a default 'You' category. One in-flight fetch is shared so only one seeds it; the server cannot dedupe, since names are encrypted.
let inFlightTree: Promise<MemoryCategory[]> | null = null;

// Seeds the default 'You' category and 'Profile' file on a fresh account, and again when the old one no longer opens.
// The server cannot do this itself, since it has no key.
export function getMemoryTree(): Promise<MemoryCategory[]> {
  if (inFlightTree) return inFlightTree;

  inFlightTree = fetchMemoryTree().finally(() => {
    inFlightTree = null;
  });
  return inFlightTree;
}

async function fetchMemoryTree(): Promise<MemoryCategory[]> {
  const key = await requireAesKey();
  const raw = await apiCall<RawCategory[]>("/api/memory/tree", { method: "GET" });
  const tree = await Promise.all(raw.map((c) => decryptCategory(key, c)));
  // A category whose name doesn't open may be the old 'You'; with no readable 'You' left, start a fresh one.
  const youLost = tree.some((c) => c.undecryptable) && !tree.some(isYou);
  if (tree.length > 0 && !youLost) return tree;
  const category = await createMemoryCategory("You");
  const file = await createMemoryFile(category.id, "Profile", "Who the user is", "");
  return [...tree, { ...category, files: [file] }];
}

const isYou = (c: MemoryCategory) => c.name.trim().toLowerCase() === "you";

export async function createMemoryCategory(name: string): Promise<MemoryCategory> {
  const key = await requireAesKey();
  const id = crypto.randomUUID();
  const encrypted_name = await encryptField(key, name, fieldAad("memory-category", id));
  const raw = await apiCall<RawCategory>("/api/memory/categories", {
    method: "POST",
    body: JSON.stringify({ id, encrypted_name }),
  });
  window.dispatchEvent(new CustomEvent("karui-memory-updated"));
  return { id: raw.id, name, updatedAt: raw.updated_at, files: [] };
}

export async function renameMemoryCategory(categoryId: string, name: string): Promise<MemoryCategory> {
  const key = await requireAesKey();
  const encrypted_name = await encryptField(key, name, fieldAad("memory-category", categoryId));
  const raw = await apiCall<RawCategory>(`/api/memory/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ encrypted_name }),
  });
  window.dispatchEvent(new CustomEvent("karui-memory-updated"));
  return { id: raw.id, name, updatedAt: raw.updated_at, files: [] };
}

export async function deleteMemoryCategory(categoryId: string): Promise<void> {
  await apiCall<void>(`/api/memory/categories/${categoryId}`, { method: "DELETE" });
  window.dispatchEvent(new CustomEvent("karui-memory-updated"));
}

async function encryptFileFields(key: CryptoKey, fileId: string, name: string, description: string, content: string) {
  const [encrypted_name, encrypted_description, encrypted_content] = await Promise.all([
    encryptField(key, name, fieldAad("memory-file-name", fileId)),
    encryptField(key, description, fieldAad("memory-file-description", fileId)),
    encryptField(key, content, fieldAad("memory-file-content", fileId)),
  ]);
  return { encrypted_name, encrypted_description, encrypted_content };
}

export async function createMemoryFile(
  categoryId: string,
  name: string,
  description: string,
  content: string
): Promise<MemoryFile> {
  const key = await requireAesKey();
  const id = crypto.randomUUID();
  const raw = await apiCall<RawFile>(`/api/memory/categories/${categoryId}/files`, {
    method: "POST",
    body: JSON.stringify({ id, ...(await encryptFileFields(key, id, name, description, content)) }),
  });
  window.dispatchEvent(new CustomEvent("karui-memory-updated"));
  return { id: raw.id, categoryId, name, description, content, updatedAt: raw.updated_at };
}

// Passed back verbatim: a Date would drop microseconds and never match. A write over a newer version is refused with 409.
export async function updateMemoryFile(
  fileId: string,
  name: string,
  description: string,
  content: string,
  expectedUpdatedAt?: string
): Promise<MemoryFile> {
  const key = await requireAesKey();
  const raw = await apiCall<RawFile>(`/api/memory/files/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(await encryptFileFields(key, fileId, name, description, content)),
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    }),
  });
  window.dispatchEvent(new CustomEvent("karui-memory-updated"));
  return { id: raw.id, categoryId: raw.category_id, name, description, content, updatedAt: raw.updated_at };
}

export async function deleteMemoryFile(fileId: string): Promise<void> {
  await apiCall<void>(`/api/memory/files/${fileId}`, { method: "DELETE" });
  window.dispatchEvent(new CustomEvent("karui-memory-updated"));
}

export interface PendingMemoryChat {
  chat_id: string;
  in_project: boolean;
  project_id?: string;
  unprocessed_user_messages: number;
  processed_at?: string;
  first_unprocessed_at: string;
}

export async function getPendingMemoryChats(): Promise<PendingMemoryChat[]> {
  return apiCall<PendingMemoryChat[]>("/api/memory/pending", { method: "GET" });
}

export interface MemoryFileForChat {
  id: string;
  category: string;
  name: string;
  description: string;
  content: string;
  updatedAt: string;
  readOnly?: boolean;
}

// Every memory file (decrypted) as the index for the decision phase. Choosing which files reach the prompt happens in the enclave, so the backend never sees either.
export async function getMemoryFilesForChat(): Promise<MemoryFileForChat[]> {
  if (!getMemorySettings().enabled) return [];
  try {
    const tree = await getMemoryTree();
    return tree.flatMap((c) =>
      c.files.map((f) => ({ id: f.id, category: c.name, name: f.name, description: f.description, content: f.content, updatedAt: f.updatedAt }))
    );
  } catch {
    return [];
  }
}

// Found by name. Returns nothing when memory is off, so a project never reads what the user switched off.
export async function getYouFilesForProject(): Promise<MemoryFileForChat[]> {
  if (!getMemorySettings().enabled) return [];
  try {
    const you = (await getMemoryTree()).find(isYou);
    return (you?.files ?? []).map((f) => ({ id: f.id, category: "You", name: f.name, description: f.description, content: f.content, updatedAt: f.updatedAt }));
  } catch {
    return [];
  }
}

export async function hasYouFolder(): Promise<boolean> {
  try {
    return (await getMemoryTree()).some((c) => c.name.trim().toLowerCase() === "you");
  } catch {
    return false;
  }
}

export async function copyYouIntoProject(projectId: string, settings: ProjectSettings): Promise<Pick<ProjectSettings, "youCopyIds" | "youCopiedAt">> {
  const tree = await getMemoryTree();
  const you = tree.find((c) => c.name.trim().toLowerCase() === "you");
  if (!you) throw new Error("There's no “You” folder in your memory.");
  for (const id of settings.youCopyIds) await deleteProjectMemoryFile(projectId, id).catch(() => {});
  const copies: ProjectMemoryFile[] = [];
  for (const f of you.files) copies.push(await createProjectMemoryFile(projectId, f.name, f.description, f.content));
  return { youCopyIds: copies.map((c) => c.id), youCopiedAt: new Date().toISOString() };
}

export interface MemoryRefreshProgress {
  batch: number;
  totalBatches: number;
}

interface RawChatRow {
  id: string;
  encrypted_title: string;
}

interface RawMessageRow {
  id: string;
  role: "user" | "assistant";
  encrypted_content: string;
  created_at: string;
}

export interface ChatBlock {
  chatId: string;
  title: string;
  turns: { role: "user" | "assistant"; content: string; at: string }[];
  userCount: number;
  through: string;
}

const TRANSCRIPT_MESSAGE_MAX_CHARS = 2000;

// Transcript text for the organising pass. Phase blocks are dropped, but <memory_write> proposals become marked lines so the pass sees them. <notice> is UI metadata and never enters the transcript.
export function stripAssistantBlocks(content: string): string {
  return annotateMemoryWrites(content)
    .replace(/<notice>[\s\S]*?(<\/notice>|$)/g, "")
    .replace(/<reasoning>[\s\S]*?(<\/reasoning>|$)/g, "")
    .replace(/<search>[\s\S]*?(<\/search>|$)/g, "")
    .replace(/<vision>[\s\S]*?(<\/vision>|$)/g, "")
    .replace(/<library>[\s\S]*?(<\/library>|$)/g, "")
    .replace(/<skills_used>[\s\S]*?(<\/skills_used>|$)/g, "")
    .replace(/<helper_message>[\s\S]*?(<\/helper_message>|$)/g, "")
    .replace(/<skill\b[^>]*?name="([^"]*)"[^>]*>[\s\S]*?(<\/skill>|$)/g, "[Skill drafted: $1]")
    .trim();
}

function clip(text: string): string {
  if (text.length <= TRANSCRIPT_MESSAGE_MAX_CHARS) return text;
  return text.slice(0, TRANSCRIPT_MESSAGE_MAX_CHARS) + " […]";
}

function turnChars(turn: ChatBlock["turns"][number]): number {
  return clip(turn.content).length + 16;
}

function headerChars(block: ChatBlock): number {
  return block.title.length + 16;
}

// Splits a chat into blocks that each fit a transcript, each with its own cursor, so no part is cut off while its cursor still advances.
function splitBlock(block: ChatBlock): ChatBlock[] {
  const out: ChatBlock[] = [];
  const header = headerChars(block);
  let turns: ChatBlock["turns"] = [];
  let size = header;
  const flush = () => {
    if (turns.length === 0) return;
    out.push({
      ...block,
      turns,
      userCount: turns.filter((t) => t.role === "user").length,
      through: turns[turns.length - 1].at,
    });
    turns = [];
    size = header;
  };
  for (const turn of block.turns) {
    if (size + turnChars(turn) > MEMORY_TRANSCRIPT_MAX_CHARS) flush();
    turns.push(turn);
    size += turnChars(turn);
  }
  flush();
  return out;
}

function buildTranscript(blocks: ChatBlock[], withIds = false): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const lines = [withIds ? `### Chat ${block.chatId}: ${block.title || "(untitled)"}` : `### Chat: ${block.title || "(untitled)"}`];
    for (const turn of block.turns) {
      lines.push(`[${turn.role}]: ${clip(turn.content)}`);
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

export function buildBatches(blocks: ChatBlock[], interval: number): ChatBlock[][] {
  const batches: ChatBlock[][] = [];
  let current: ChatBlock[] = [];
  let count = 0;
  let size = 0;
  for (const block of blocks.flatMap(splitBlock)) {
    const blockSize = block.turns.reduce((n, t) => n + turnChars(t), headerChars(block));
    if (block.userCount >= interval) {
      batches.push([block]);
      continue;
    }
    if (current.length > 0 && size + blockSize > MEMORY_TRANSCRIPT_MAX_CHARS) {
      batches.push(current);
      current = [];
      count = 0;
      size = 0;
    }
    current.push(block);
    count += block.userCount;
    size += blockSize;
    if (count >= interval) {
      batches.push(current);
      current = [];
      count = 0;
      size = 0;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

let refreshRunning = false;

async function withMemoryRefreshLock<T>(refresh: () => Promise<T>): Promise<T> {
  const userId = getUser()?.id;
  if (!userId) throw new Error("No active session. Please sign in again.");
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("Memory refresh requires a browser with Web Locks support.");
  }
  return navigator.locks.request(`karui-memory-refresh:${userId}`, async () => {
    if (getUser()?.id !== userId) throw new Error("Your session changed while waiting to refresh memory.");
    return refresh();
  });
}

export function isMemoryRefreshRunning(): boolean {
  return refreshRunning;
}

export interface LiveMemoryEdit {
  fileId: string;
  name: string;
  description: string;
  content: string;
  updatedAt?: string;
}

// Returns false when nothing is saved, including while the organising pass runs: that pass rewrites files from the tree it fetched and would overwrite the edit silently.
export async function applyLiveMemoryEdit(edit: LiveMemoryEdit): Promise<boolean> {
  if (refreshRunning) return false;
  try {
    await updateMemoryFile(edit.fileId, edit.name, edit.description, edit.content, edit.updatedAt);
    return true;
  } catch {
    return false;
  }
}

export function applyProjectMemoryEdit(projectId: string): (edit: LiveMemoryEdit) => Promise<boolean> {
  return async (edit) => {
    if (refreshRunning) return false;
    try {
      await updateProjectMemoryFile(projectId, edit.fileId, edit.name, edit.description, edit.content, edit.updatedAt);
      return true;
    } catch {
      return false;
    }
  };
}

async function applyOperation(tree: MemoryCategory[], op: MemoryOperation): Promise<void> {
  if (op.action === "create_file") {
    const categoryName = (op.category ?? "").trim();
    const fileName = (op.file_name ?? "").trim();
    if (!categoryName || !fileName) return;

    let category = tree.find((c) => c.name.trim().toLowerCase() === categoryName.toLowerCase());
    if (!category) {
      category = await createMemoryCategory(categoryName);
      tree.push(category);
    }
    const file = await createMemoryFile(category.id, fileName, op.description, op.content);
    category.files.push(file);
  } else if (op.action === "update_file") {
    const fileId = (op.file_id ?? "").trim();
    if (!fileId) return;
    const file = tree.flatMap((c) => c.files).find((f) => f.id === fileId);
    if (!file) return;
    const updated = await updateMemoryFile(file.id, op.file_name?.trim() || file.name, op.description, op.content, file.updatedAt);
    Object.assign(file, updated);
  }
}

async function chatBlocks(key: CryptoKey, pending: PendingMemoryChat[]): Promise<ChatBlock[]> {

  const rawChats = await apiCall<RawChatRow[]>("/api/chats", { method: "GET" });
  const titles = new Map<string, string>();
  await Promise.all(
    rawChats.map(async (c) => {
      try {
        titles.set(c.id, await decryptField(key, c.encrypted_title, fieldAad("chat-title", c.id)));
      } catch {
        titles.set(c.id, "");
      }
    })
  );

  const blocks: ChatBlock[] = [];
  for (const p of pending) {
    const rawMessages = await apiCall<RawMessageRow[]>(`/api/chats/${p.chat_id}/messages`, { method: "GET" });
    const cursor = p.processed_at ? new Date(p.processed_at).getTime() : 0;
    const fresh = rawMessages.filter((m) => new Date(m.created_at).getTime() > cursor);
    if (fresh.length === 0) continue;

    const turns: ChatBlock["turns"] = [];
    let userCount = 0;
    for (const m of fresh) {
      let content = "";
      try {
        content = await decryptField(key, m.encrypted_content, messageAad(p.chat_id, m.id, m.role));
      } catch {
        continue;
      }
      if (m.role === "assistant") {
        content = stripAssistantBlocks(content);
      } else {
        const parsed = parseMessageContent(content);
        content = parsed.text;
        if (parsed.images.length > 0) content += `\n[attached ${parsed.images.length} image(s)]`;
        if (parsed.files.length > 0) content += `\n[attached ${parsed.files.length} file(s)]`;
      }
      if (!content.trim()) continue;
      turns.push({ role: m.role, content, at: m.created_at });
      if (m.role === "user") userCount += 1;
    }
    if (userCount === 0) continue;

    blocks.push({ chatId: p.chat_id, title: titles.get(p.chat_id) ?? "", turns, userCount, through: fresh[fresh.length - 1].created_at });
  }
  return blocks;
}

// Cursors advance after EVERY batch — an interrupted pass loses no progress and
// processes nothing twice.
function markProcessed(batch: ChatBlock[]): Promise<void> {
  return apiCall<void>("/api/memory/mark-processed", {
    method: "POST",
    body: JSON.stringify({ processed: batch.map((b) => ({ chat_id: b.chatId, through: b.through })) }),
  });
}

// Returns the updated tree, or null if there was nothing to process. Throws on error; batches already saved remain and the cursors stay consistent.
export async function refreshMemory(
  onProgress?: (progress: MemoryRefreshProgress) => void
): Promise<MemoryCategory[] | null> {
  if (refreshRunning) throw new Error("Memory refresh is already running");
  if (!getMemorySettings().enabled) throw new Error("Memory is disabled");

  refreshRunning = true;
  try {
    return await withMemoryRefreshLock(async () => {
      const settings = getMemorySettings();
      if (!settings.enabled) throw new Error("Memory is disabled");
      const key = await requireAesKey();
      const pending = (await getPendingMemoryChats()).filter((p) => !p.project_id);
      if (pending.length === 0) return null;

      const blocks = await chatBlocks(key, pending);
      if (blocks.length === 0) return null;

      const batches = buildBatches(blocks, settings.interval);

      const tree = await getMemoryTree();
      for (let i = 0; i < batches.length; i++) {
        onProgress?.({ batch: i + 1, totalBatches: batches.length });
        const batch = batches[i];

        // Runs in the enclave: transcripts and the memory tree must never reach the backend in plaintext.
        const operations = await organizeMemoryE2E(
          getProvider(),
          tree.map((c) => ({
            name: c.name,
            files: c.files.map((f) => ({
              fileId: f.id,
              name: f.name,
              description: f.description,
              content: f.content,
            })),
          })),
          buildTranscript(batch)
        );

        for (const op of operations) {
          await applyOperation(tree, op);
        }
        await markProcessed(batch);
      }
      window.dispatchEvent(new CustomEvent("karui-memory-updated"));
      return tree;
    });
  } finally {
    refreshRunning = false;
  }
}

export async function refreshProjectMemory(
  projectId: string,
  setBrief: (chatId: string, brief: string) => Promise<void>
): Promise<void> {
  if (refreshRunning) return;
  refreshRunning = true;
  try {
    await withMemoryRefreshLock(async () => {
      const project = await getProject(projectId);
      if (!project.settings.memory) return;
      const key = await requireAesKey();
      const pending = (await getPendingMemoryChats()).filter((p) => p.project_id === projectId);
      const blocks = await chatBlocks(key, pending);
      if (blocks.length === 0) return;

      const files = await listProjectMemory(projectId);
      for (const batch of buildBatches(blocks, getMemorySettings().interval)) {
        const { operations, briefs } = await organizeProjectMemoryE2E(
          getProvider(),
          { name: project.name, goal: project.goal },
          files.map((f) => ({ fileId: f.id, name: f.name, description: f.description, content: f.content })),
          buildTranscript(batch, true),
          batch.map((b) => b.chatId)
        );
        for (const op of operations) {
          if (op.action === "create_file" && op.file_name?.trim()) {
            files.push(await createProjectMemoryFile(projectId, op.file_name.trim(), op.description, op.content));
          } else if (op.action === "update_file") {
            const file = files.find((f) => f.id === op.file_id);
            if (!file) continue;
            Object.assign(file, await updateProjectMemoryFile(projectId, file.id, op.file_name?.trim() || file.name, op.description, op.content, file.updated_at));
          }
        }
        for (const [chatId, brief] of briefs) await setBrief(chatId, brief).catch(() => {});
        await markProcessed(batch);
      }
      window.dispatchEvent(new CustomEvent("karui-reload-chats"));
    });
  } finally {
    refreshRunning = false;
  }
}

// Errors are swallowed: automation must not interfere with the conversation.
export async function maybeAutoMemory(setBrief: (chatId: string, brief: string) => Promise<void>): Promise<void> {
  const settings = getMemorySettings();
  if (refreshRunning) return;
  try {
    const pending = await getPendingMemoryChats();
    const count = (list: PendingMemoryChat[]) => list.reduce((sum, p) => sum + p.unprocessed_user_messages, 0);

    const own = pending.filter((p) => !p.project_id);
    if (settings.enabled && settings.auto && count(own) >= settings.interval) await refreshMemory();

    const byProject = new Map<string, PendingMemoryChat[]>();
    for (const p of pending) if (p.project_id) byProject.set(p.project_id, [...(byProject.get(p.project_id) ?? []), p]);
    for (const [projectId, list] of byProject) {
      if (count(list) >= settings.interval) await refreshProjectMemory(projectId, setBrief);
    }
  } catch {
  }
}
