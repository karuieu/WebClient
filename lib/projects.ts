import { ensureAesKey } from "./session";
import { decryptField, encryptField, fieldAad } from "./crypto";
import { API_URL, JSON_HEADERS, apiFetch } from "./api";

async function requireAesKey(): Promise<CryptoKey> {
  const key = await ensureAesKey();
  if (!key) throw new Error("Encryption key unavailable — please sign in again.");
  return key;
}

/** An API error with its HTTP status, so callers can tell a conflict (409) or a full Library (507). */
export class ProjectApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function apiCall<T>(endpoint: string, options: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...JSON_HEADERS, ...options.headers },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ProjectApiError(data.error || `HTTP error: ${response.status}`, response.status);
  }
  if (response.status === 204) return null as unknown as T;
  return response.json();
}

async function safeDecrypt(key: CryptoKey, value: string, aad: string): Promise<string> {
  if (!value) return "";
  try {
    return await decryptField(key, value, aad);
  } catch {
    return "(unable to decrypt)";
  }
}

export type YouMode = "live" | "copy" | "off";

export interface ProjectSettings {

  memory: boolean;
  you: YouMode;
  youCopiedAt: string | null;
  youCopyIds: string[];
  connectorIds: string[];
  skillIds: string[];
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  memory: true,
  you: "live",
  youCopiedAt: null,
  youCopyIds: [],
  connectorIds: [],
  skillIds: [],
};

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseProjectSettings(json: string): ProjectSettings {
  let raw: unknown = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const s = { ...DEFAULT_PROJECT_SETTINGS };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r.memory === "boolean") s.memory = r.memory;
    if (r.you === "live" || r.you === "copy" || r.you === "off") s.you = r.you;
    if (typeof r.youCopiedAt === "string") s.youCopiedAt = r.youCopiedAt;
    s.youCopyIds = stringArray(r.youCopyIds);
    s.connectorIds = stringArray(r.connectorIds);
    s.skillIds = stringArray(r.skillIds);
  }
  return s;
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  settings: ProjectSettings;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

interface RawProject {
  id: string;
  encrypted_name: string;
  encrypted_goal: string;
  encrypted_settings: string;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

async function decryptProject(key: CryptoKey, raw: RawProject): Promise<Project> {
  const [name, goal, settings] = await Promise.all([
    safeDecrypt(key, raw.encrypted_name, fieldAad("project-name", raw.id)),
    safeDecrypt(key, raw.encrypted_goal, fieldAad("project-description", raw.id)),
    raw.encrypted_settings ? decryptField(key, raw.encrypted_settings, fieldAad("project-settings", raw.id)).catch(() => "") : "",
  ]);
  return {
    id: raw.id,
    name,
    goal,
    settings: parseProjectSettings(settings),
    starred: raw.starred,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export async function getProjects(): Promise<Project[]> {
  const key = await requireAesKey();
  const raw = await apiCall<RawProject[]>("/api/projects", { method: "GET" });
  return Promise.all(raw.map((p) => decryptProject(key, p)));
}

export async function getProject(id: string): Promise<Project> {
  const key = await requireAesKey();
  const raw = await apiCall<RawProject>(`/api/projects/${id}`, { method: "GET" });
  return decryptProject(key, raw);
}

function notifyProject(id: string) {
  window.dispatchEvent(new CustomEvent("karui-reload-projects", { detail: { id } }));
}

export async function createProject(name: string, goal: string): Promise<Project> {
  const key = await requireAesKey();
  // The id comes from here, not the server: the fields are bound to it.
  const id = crypto.randomUUID();
  const [encrypted_name, encrypted_goal, encrypted_settings] = await Promise.all([
    encryptField(key, name, fieldAad("project-name", id)),
    encryptField(key, goal, fieldAad("project-description", id)),
    encryptField(key, JSON.stringify(DEFAULT_PROJECT_SETTINGS), fieldAad("project-settings", id)),
  ]);
  const raw = await apiCall<RawProject>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ id, encrypted_name, encrypted_goal, encrypted_settings }),
  });
  return decryptProject(key, raw);
}

export async function updateProject(
  id: string,
  patch: { name?: string; goal?: string; settings?: ProjectSettings }
): Promise<Project> {
  const key = await requireAesKey();
  const body: Record<string, string> = {};
  if (patch.name !== undefined) body.encrypted_name = await encryptField(key, patch.name, fieldAad("project-name", id));
  if (patch.goal !== undefined) body.encrypted_goal = await encryptField(key, patch.goal, fieldAad("project-description", id));
  if (patch.settings !== undefined) {
    body.encrypted_settings = await encryptField(key, JSON.stringify(patch.settings), fieldAad("project-settings", id));
  }
  const raw = await apiCall<RawProject>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  const project = await decryptProject(key, raw);
  notifyProject(id);
  return project;
}

export async function starProject(id: string): Promise<{ starred: boolean }> {
  return apiCall<{ starred: boolean }>(`/api/projects/${id}/star`, { method: "PATCH" });
}

export async function deleteProject(id: string): Promise<void> {
  return apiCall<void>(`/api/projects/${id}`, { method: "DELETE" });
}

export async function assignChatToProject(projectId: string, chatId: string): Promise<void> {
  return apiCall<void>(`/api/projects/${projectId}/chats`, {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId }),
  });
}

export async function unassignChatFromProject(projectId: string, chatId: string): Promise<void> {
  return apiCall<void>(`/api/projects/${projectId}/chats/${chatId}`, { method: "DELETE" });
}

export interface ProjectMemoryFile {
  id: string;
  project_id: string;
  name: string;
  description: string;
  content: string;
  /** Passed back verbatim as expected_updated_at (a Date would drop the microseconds). */
  updated_at: string;
}

interface RawMemoryFile {
  id: string;
  project_id: string;
  encrypted_name: string;
  encrypted_description: string;
  encrypted_content: string;
  updated_at: string;
}

async function decryptMemoryFile(key: CryptoKey, raw: RawMemoryFile): Promise<ProjectMemoryFile> {
  const [name, description, content] = await Promise.all([
    safeDecrypt(key, raw.encrypted_name, fieldAad("project-memory-name", raw.project_id, raw.id)),
    safeDecrypt(key, raw.encrypted_description, fieldAad("project-memory-description", raw.project_id, raw.id)),
    safeDecrypt(key, raw.encrypted_content, fieldAad("project-memory-content", raw.project_id, raw.id)),
  ]);
  return { id: raw.id, project_id: raw.project_id, name, description, content, updated_at: raw.updated_at };
}

async function encryptMemoryFile(key: CryptoKey, projectId: string, id: string, name: string, description: string, content: string) {
  const [encrypted_name, encrypted_description, encrypted_content] = await Promise.all([
    encryptField(key, name, fieldAad("project-memory-name", projectId, id)),
    encryptField(key, description, fieldAad("project-memory-description", projectId, id)),
    encryptField(key, content, fieldAad("project-memory-content", projectId, id)),
  ]);
  return { encrypted_name, encrypted_description, encrypted_content };
}

function notifyMemory(projectId: string) {
  window.dispatchEvent(new CustomEvent("karui-project-memory-updated", { detail: { projectId } }));
}

export async function listProjectMemory(projectId: string): Promise<ProjectMemoryFile[]> {
  const key = await requireAesKey();
  const raw = await apiCall<RawMemoryFile[]>(`/api/projects/${projectId}/memory`, { method: "GET" });
  return Promise.all(raw.map((f) => decryptMemoryFile(key, f)));
}

export async function createProjectMemoryFile(projectId: string, name: string, description: string, content: string): Promise<ProjectMemoryFile> {
  const key = await requireAesKey();
  const id = crypto.randomUUID();
  const raw = await apiCall<RawMemoryFile>(`/api/projects/${projectId}/memory`, {
    method: "POST",
    body: JSON.stringify({ id, ...(await encryptMemoryFile(key, projectId, id, name, description, content)) }),
  });
  notifyMemory(projectId);
  return { id: raw.id, project_id: projectId, name, description, content, updated_at: raw.updated_at };
}

export async function updateProjectMemoryFile(
  projectId: string,
  fileId: string,
  name: string,
  description: string,
  content: string,
  expectedUpdatedAt?: string
): Promise<ProjectMemoryFile> {
  const key = await requireAesKey();
  const raw = await apiCall<RawMemoryFile>(`/api/projects/${projectId}/memory/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(await encryptMemoryFile(key, projectId, fileId, name, description, content)),
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    }),
  });
  notifyMemory(projectId);
  return { id: raw.id, project_id: projectId, name, description, content, updated_at: raw.updated_at };
}

export async function deleteProjectMemoryFile(projectId: string, fileId: string): Promise<void> {
  await apiCall<void>(`/api/projects/${projectId}/memory/${fileId}`, { method: "DELETE" });
  notifyMemory(projectId);
}

export interface LibraryFileMeta {
  id: string;
  path: string;
  preview: string;
  size: number;
  /** v1, v2, … : every save is the next number. */
  version: number;
  /** The current version stays in the history once it's replaced. */
  kept: boolean;
  updated_at: string;
}

export interface LibraryListing {
  files: LibraryFileMeta[];
  project: { used: number; limit: number };
  maxFiles: number;
  account: { used: number; limit: number };
}

interface RawLibraryFile {
  id: string;
  encrypted_path: string;
  encrypted_preview: string;
  size: number;
  version?: number;
  kept?: boolean;
  updated_at: string;
}

interface RawLibraryListing {
  files: RawLibraryFile[];
  project: { used: number; limit: number };
  max_files: number;
  account: { used: number; limit: number };
}

async function decryptLibraryFile(key: CryptoKey, projectId: string, raw: RawLibraryFile): Promise<LibraryFileMeta> {
  const [path, preview] = await Promise.all([
    safeDecrypt(key, raw.encrypted_path, fieldAad("project-file-path", projectId, raw.id)),
    safeDecrypt(key, raw.encrypted_preview, fieldAad("project-file-preview", projectId, raw.id)),
  ]);
  return { id: raw.id, path, preview, size: raw.size, version: raw.version ?? 1, kept: raw.kept ?? false, updated_at: raw.updated_at };
}

function notifyFiles(projectId: string) {
  window.dispatchEvent(new CustomEvent("karui-project-files-updated", { detail: { projectId } }));
}

export async function listProjectFiles(projectId: string): Promise<LibraryListing> {
  const key = await requireAesKey();
  const raw = await apiCall<RawLibraryListing>(`/api/projects/${projectId}/files`, { method: "GET" });
  return {
    files: await Promise.all(raw.files.map((f) => decryptLibraryFile(key, projectId, f))),
    project: raw.project,
    maxFiles: raw.max_files,
    account: raw.account,
  };
}

// Decrypted contents for the session, keyed by file and version — never written to
// disk (no plaintext in localStorage or sessionStorage).
const contentCache = new Map<string, { updatedAt: string; content: string }>();

/** One request stays well under the server's 48 MiB body limit and its 200-file cap. */
const UPLOAD_BATCH_BYTES = 16 << 20;
const UPLOAD_BATCH_FILES = 200;

export interface NewLibraryFile {
  path: string;
  content: string;
  preview: string;
}

/**
 * Encrypts and uploads files in batches. Each batch is all-or-nothing on the
 * server; one that fails stops the upload, and the ones before it stay.
 */
export async function uploadProjectFiles(
  projectId: string,
  files: NewLibraryFile[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const key = await requireAesKey();
  let batch: { id: string; encrypted_path: string; encrypted_preview: string; encrypted_content: string }[] = [];
  let batchBytes = 0;
  let done = 0;

  const send = async () => {
    if (batch.length === 0) return;
    await apiCall<unknown>(`/api/projects/${projectId}/files`, { method: "POST", body: JSON.stringify({ files: batch }) });
    done += batch.length;
    batch = [];
    batchBytes = 0;
    onProgress?.(done, files.length);
  };

  try {
    onProgress?.(0, files.length);
    for (const f of files) {
      const id = crypto.randomUUID();
      const [encrypted_path, encrypted_preview, encrypted_content] = await Promise.all([
        encryptField(key, f.path, fieldAad("project-file-path", projectId, id)),
        encryptField(key, f.preview, fieldAad("project-file-preview", projectId, id)),
        encryptField(key, f.content, fieldAad("project-file-content", projectId, id)),
      ]);
      const size = encrypted_path.length + encrypted_preview.length + encrypted_content.length;
      if (batch.length > 0 && (batchBytes + size > UPLOAD_BATCH_BYTES || batch.length >= UPLOAD_BATCH_FILES)) await send();
      batch.push({ id, encrypted_path, encrypted_preview, encrypted_content });
      batchBytes += size;
    }
    await send();
  } finally {
    notifyFiles(projectId);
  }
}

interface RawFileContent {
  id: string;
  encrypted_content: string;
  updated_at: string;
}

export async function readProjectFiles(projectId: string, files: Pick<LibraryFileMeta, "id" | "updated_at">[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const f of files) {
    const hit = contentCache.get(f.id);
    if (hit && hit.updatedAt === f.updated_at) out.set(f.id, hit.content);
    else missing.push(f.id);
  }
  if (missing.length === 0) return out;

  const key = await requireAesKey();
  for (let i = 0; i < missing.length; i += UPLOAD_BATCH_FILES) {
    const raw = await apiCall<RawFileContent[]>(`/api/projects/${projectId}/files/read`, {
      method: "POST",
      body: JSON.stringify({ ids: missing.slice(i, i + UPLOAD_BATCH_FILES) }),
    });
    await Promise.all(
      raw.map(async (r) => {
        const content = await decryptField(key, r.encrypted_content, fieldAad("project-file-content", projectId, r.id));
        contentCache.set(r.id, { updatedAt: r.updated_at, content });
        out.set(r.id, content);
      })
    );
  }
  return out;
}

/** `keepVersion` moves the content being replaced into the file's versions (notes and documents). */
export async function updateProjectFile(
  projectId: string,
  file: Pick<LibraryFileMeta, "id" | "updated_at">,
  content: string,
  preview: string,
  keepVersion = false
): Promise<LibraryFileMeta> {
  const key = await requireAesKey();
  const [encrypted_preview, encrypted_content] = await Promise.all([
    encryptField(key, preview, fieldAad("project-file-preview", projectId, file.id)),
    encryptField(key, content, fieldAad("project-file-content", projectId, file.id)),
  ]);
  const raw = await apiCall<RawLibraryFile>(`/api/projects/${projectId}/files/${file.id}`, {
    method: "PATCH",
    body: JSON.stringify({ encrypted_preview, encrypted_content, expected_updated_at: file.updated_at, keep_version: keepVersion }),
  });
  contentCache.set(raw.id, { updatedAt: raw.updated_at, content });
  notifyFiles(projectId);
  return decryptLibraryFile(key, projectId, raw);
}

export async function deleteProjectFiles(projectId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += UPLOAD_BATCH_FILES) {
    await apiCall<void>(`/api/projects/${projectId}/files/delete`, {
      method: "POST",
      body: JSON.stringify({ ids: ids.slice(i, i + UPLOAD_BATCH_FILES) }),
    });
  }
  for (const id of ids) contentCache.delete(id);
  notifyFiles(projectId);
}

export interface FileVersionMeta {
  id: string;
  number: number;
  size: number;
  kept: boolean;
  saved_at: string;
}

export async function listFileVersions(projectId: string, fileId: string): Promise<FileVersionMeta[]> {
  return apiCall<FileVersionMeta[]>(`/api/projects/${projectId}/files/${fileId}/versions`, { method: "GET" });
}

/** A version is the file's own ciphertext, moved: it decrypts under the file's AAD. */
export async function readFileVersion(projectId: string, fileId: string, versionId: string): Promise<string> {
  const key = await requireAesKey();
  const raw = await apiCall<{ encrypted_content: string }>(`/api/projects/${projectId}/files/${fileId}/versions/${versionId}`, { method: "GET" });
  return decryptField(key, raw.encrypted_content, fieldAad("project-file-content", projectId, fileId));
}

export async function keepFileVersion(projectId: string, fileId: string): Promise<LibraryFileMeta> {
  const key = await requireAesKey();
  const raw = await apiCall<RawLibraryFile>(`/api/projects/${projectId}/files/${fileId}/keep`, { method: "POST" });
  notifyFiles(projectId);
  return decryptLibraryFile(key, projectId, raw);
}

export async function deleteFileVersion(projectId: string, fileId: string, versionId: string): Promise<void> {
  await apiCall<void>(`/api/projects/${projectId}/files/${fileId}/versions/${versionId}`, { method: "DELETE" });
}
