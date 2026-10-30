import type { PickedItem, SkipReason, SkippedItem } from "@/components/app/project/Library";
import { estimateTokens } from "@/lib/messages/context";
import { artifactPath, libraryPath, parseArtifacts, planWrites, setArtifactAttrs, tagAttr, type Artifact, type BlockWrite } from "@/lib/artifacts/artifacts";
import { blockJSON } from "@/lib/messages/messageBlocks";
import { extractPdfText } from "./pdfText";
import {
  keepFileVersion,
  listProjectFiles,
  ProjectApiError,
  readProjectFiles,
  updateProjectFile,
  uploadProjectFiles,
  type LibraryFileMeta,
} from "./projects";

export interface LibraryIndexEntry {
  id: string;
  path: string;
  size: number;
  preview: string;
}

const MB = 1024 * 1024;

// Per-project limit in bytes. The server enforces the same number.
export const LIBRARY_LIMITS = {
  free: { bytes: 25 * MB, files: 100 },
  pro: { bytes: 250 * MB, files: 2000 },
} as const;

export const MAX_TEXT_FILE_BYTES = 2 * MB;
export const MAX_PDF_BYTES = 50 * MB;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "target", "vendor",
  "__pycache__", ".venv", "venv", "coverage", ".turbo", ".cache", ".idea", ".vscode",
]);

const LOCKFILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Cargo.lock",
  "poetry.lock", "Pipfile.lock", "composer.lock", "Gemfile.lock", "go.sum",
]);

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "mdx", "rst", "org", "tex", "bib", "csv", "tsv", "json", "jsonl",
  "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "html", "htm", "css", "scss", "sass", "less",
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "svelte", "astro", "py", "ipynb", "go", "rs",
  "java", "kt", "kts", "scala", "swift", "c", "h", "cpp", "cc", "hpp", "cs", "rb", "php", "pl",
  "lua", "r", "jl", "dart", "ex", "exs", "erl", "hs", "ml", "clj", "sh", "bash", "zsh", "fish",
  "ps1", "bat", "sql", "graphql", "gql", "proto", "tf", "hcl", "dockerfile", "gradle", "cmake",
  "make", "mk", "log", "srt", "vtt", "svg",
]);

export interface PickedPath {
  file: File;
  path: string;
}

export interface PreparedFile {
  path: string;
  content: string;
  size: number;
  preview: string;
}

export interface PreparedSelection {
  items: PickedItem[];
  skipped: SkippedItem[];

  files: Map<string, PreparedFile[]>;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export type PathCheck = { skip: SkipReason; at: string } | { skip: null; pdf: boolean };

export function checkPath(path: string, size: number, mime = ""): PathCheck {
  const parts = path.split("/");
  const dirIndex = parts.slice(0, -1).findIndex((p) => IGNORED_DIRS.has(p));
  if (dirIndex !== -1) return { skip: "folder", at: `${parts.slice(0, dirIndex + 1).join("/")}/` };

  const name = parts[parts.length - 1];
  if (name === ".env" || name.startsWith(".env.")) return { skip: "secret", at: path };
  if (LOCKFILES.has(name)) return { skip: "lockfile", at: path };

  const ext = extension(name);
  if (ext === "pdf" || mime === "application/pdf") {
    return size > MAX_PDF_BYTES ? { skip: "too-big", at: path } : { skip: null, pdf: true };
  }
  const text =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    TEXT_EXTENSIONS.has(ext) ||
    (ext === "" && mime === "");
  if (!text) return { skip: "binary", at: path };
  if (size > MAX_TEXT_FILE_BYTES) return { skip: "too-big", at: path };
  return { skip: null, pdf: false };
}

export function previewOf(content: string): string {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const heading = lines.find((l) => /^#{1,3}\s/.test(l));
  return (heading ?? lines[0] ?? "").slice(0, 200);
}

function failureReason(error: unknown): string {
  if (error instanceof ProjectApiError && error.status === 409) return "the file changed in the meantime";
  if (error instanceof ProjectApiError && error.status === 507) return "the Library is full";
  return "it couldn't be saved";
}

type SaveResult = Record<string, string>;

async function createFile(projectId: string, path: string, content: string): Promise<SaveResult> {
  return uploadProjectFiles(projectId, [{ path, content, preview: previewOf(content) }]).then(
    () => ({ path, saved: "created" }),
    // No reason: the card offers Save to Library instead.
    () => ({ path, saved: "failed" }),
  );
}

async function replaceFile(projectId: string, file: LibraryFileMeta, content: string, saved: string): Promise<SaveResult> {
  return updateProjectFile(projectId, file, content, previewOf(content), true).then(
    () => ({ path: file.path, saved }),
    (error: unknown) => ({ path: file.path, saved: "failed", reason: failureReason(error) }),
  );
}

// A merged block was folded into a later one for the same file, which makes the one save.
async function saveWrite(projectId: string, write: BlockWrite, files: Map<string, LibraryFileMeta>): Promise<SaveResult | null> {
  if (write.kind === "merged") return null;
  if (write.kind === "failed") return { ...(write.path && { path: write.path }), saved: "failed", reason: write.reason };
  const file = files.get(write.path);
  if (!file) return createFile(projectId, write.path, write.content);
  if (write.changes === undefined) return replaceFile(projectId, file, write.content, "updated");
  const result = await replaceFile(projectId, file, write.content, "edited");
  return result.saved === "edited" ? { ...result, changes: String(write.changes) } : result;
}

// The current text of the files the answer changes, read once: edits apply to it and a rewrite is checked against it.
// A file that can't be read has no text, so its edits fail.
async function currentTexts(projectId: string, closed: Artifact[], files: Map<string, LibraryFileMeta>): Promise<Map<string, string | undefined>> {
  const changed = closed.filter((a) => a.path).map((a) => files.get(artifactPath(a))).filter((f) => f !== undefined);
  const texts = changed.length > 0 ? await readProjectFiles(projectId, [...new Set(changed)]).catch(() => new Map<string, string>()) : new Map<string, string>();
  return new Map([...files.values()].map((f) => [f.path, texts.get(f.id)]));
}

const KEEP_TAG = /<keep_version\b([^>]*?)\/?>(?:\s*<\/keep_version>)?/g;

// <keep_version path="…"/> from the model becomes a <kept_version> block, which shows as a step under the answer.
async function keepVersions(projectId: string, content: string, files: Map<string, LibraryFileMeta>): Promise<string> {
  const blocks: string[] = [];
  for (const [, attrs] of content.matchAll(KEEP_TAG)) {
    const path = tagAttr(attrs, "path").replace(/^\.?\//, "");
    const file = files.get(path);
    const kept = file ? await keepFileVersion(projectId, file.id).then(() => true, () => false) : false;
    blocks.push(`<kept_version>${blockJSON({ path, status: kept ? "ok" : "error" })}</kept_version>`);
  }
  let index = 0;
  return content.replace(KEEP_TAG, () => blocks[index++]);
}

/**
 * Saves a project chat's answer to the Library: kept versions first, so an edit in the same answer keeps the version
 * it replaces. Returns the answer with the outcome written into its tags.
 */
export async function saveArtifactsToLibrary(projectId: string, content: string): Promise<string> {
  const closed = parseArtifacts(content).artifacts.filter((a) => !a.streaming);
  if (closed.length === 0 && !content.match(KEEP_TAG)) return content;
  let files: Map<string, LibraryFileMeta>;
  try {
    files = new Map((await listProjectFiles(projectId)).files.map((f) => [f.path, f]));
  } catch {
    return content;
  }
  const kept = await keepVersions(projectId, content, files);
  const writes = planWrites(closed, await currentTexts(projectId, closed, files), "the file isn't in the Library");
  const results: (SaveResult | null)[] = [];
  for (const write of writes) results.push(await saveWrite(projectId, write, files));
  return setArtifactAttrs(kept, results, writes.map((w) => (w.kind === "merged" ? null : undefined)));
}

export async function saveArtifactToLibrary(projectId: string, artifact: Artifact): Promise<string> {
  const listing = await listProjectFiles(projectId);
  const path = libraryPath(artifact, new Set(listing.files.map((f) => f.path)));
  await uploadProjectFiles(projectId, [{ path, content: artifact.content, preview: previewOf(artifact.content) }]);
  return path;
}

export function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function fromInput(files: File[], asFolder: boolean): PickedPath[] {
  return files.map((file) => ({ file, path: (asFolder && file.webkitRelativePath) || file.name }));
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: PickedPath[]): Promise<void> {
  const path = entry.fullPath.replace(/^\//, "");
  if (entry.isFile) {
    out.push({ file: await entryFile(entry as FileSystemFileEntry), path });
    return;
  }
  // An ignored folder isn't walked at all (node_modules can hold 100k files);
  // checkPath still reports it once.
  if (IGNORED_DIRS.has(entry.name)) {
    out.push({ file: new File([], ".ignored"), path: `${path}/.ignored` });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands out a directory in chunks until it returns none.
  for (let batch = await readEntries(reader); batch.length > 0; batch = await readEntries(reader)) {
    for (const child of batch) await walk(child, out);
  }
}

export async function fromDataTransfer(data: DataTransfer): Promise<PickedPath[]> {
  const entries = Array.from(data.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return fromInput(Array.from(data.files), false);
  const out: PickedPath[] = [];
  for (const entry of entries) await walk(entry, out);
  return out;
}

export async function prepareFiles(picked: PickedPath[], onReadingPdfs?: (count: number) => void): Promise<PreparedSelection> {
  const skipped: SkippedItem[] = [];
  const seen = new Set<string>();
  const accepted: { file: File; path: string; pdf: boolean }[] = [];

  for (const p of picked) {
    const check = checkPath(p.path, p.file.size, p.file.type);
    if (check.skip) {
      if (!seen.has(check.at)) skipped.push({ path: check.at, reason: check.skip });
      seen.add(check.at);
    } else {
      accepted.push({ ...p, pdf: check.pdf });
    }
  }

  const pdfs = accepted.filter((a) => a.pdf).length;
  if (pdfs) onReadingPdfs?.(pdfs);

  const ready: PreparedFile[] = [];
  for (const a of accepted) {
    let content: string;
    try {
      content = a.pdf ? await extractPdfText(a.file) : await a.file.text();
    } catch {
      skipped.push({ path: a.path, reason: "unreadable" });
      continue;
    }
    // A NUL byte means the "text" file is binary after all; an empty PDF is a scan.
    if (content.includes("\u0000")) {
      skipped.push({ path: a.path, reason: "binary" });
      continue;
    }
    if (a.pdf && !content.trim()) {
      skipped.push({ path: a.path, reason: "unreadable" });
      continue;
    }
    const size = byteSize(content);
    if (size > MAX_TEXT_FILE_BYTES) {
      skipped.push({ path: a.path, reason: "too-big" });
      continue;
    }
    ready.push({ path: a.path, content, size, preview: previewOf(content) });
  }
  if (pdfs) onReadingPdfs?.(0);

  const items: PickedItem[] = [];
  const files = new Map<string, PreparedFile[]>();
  const folders = new Map<string, PreparedFile[]>();
  for (const f of ready) {
    const slash = f.path.indexOf("/");
    if (slash === -1) {
      const id = crypto.randomUUID();
      items.push({ kind: "file", id, name: f.path, size: f.size });
      files.set(id, [f]);
    } else {
      const root = f.path.slice(0, slash);
      folders.set(root, [...(folders.get(root) ?? []), f]);
    }
  }
  for (const [name, list] of folders) {
    const id = crypto.randomUUID();
    items.push({ kind: "folder", id, name, files: list.map((f) => ({ path: f.path, size: f.size })) });
    files.set(id, list);
  }
  return { items, skipped, files };
}

export function libraryBlock(files: LibraryIndexEntry[], contents: Map<string, string>, tokenCap: number): string {
  const parts: string[] = [];
  let left = tokenCap;
  for (const f of files) {
    const content = contents.get(f.id);
    if (content === undefined || left <= 0) continue;
    const tokens = estimateTokens(content);
    const body =
      tokens <= left
        ? content
        : content.slice(0, Math.max(0, Math.floor(content.length * (left / tokens)))) + "\n[…the rest of this file didn't fit]";
    left -= Math.min(tokens, left);
    parts.push(`<file path=${JSON.stringify(f.path)}>\n${body}\n</file>`);
  }
  return parts.join("\n");
}
