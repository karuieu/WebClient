// A normal chat's notes and documents live in its messages: every answer that writes one is a new version of that file.
// Nothing here is stored separately, so the files follow retries, deleted chats and incognito for free.

import { artifactPath, libraryPath, parseArtifacts, planWrites, replaceArtifactBlocks, setArtifactAttrs, type Artifact, type ArtifactType } from "./artifacts";
import { byteSize, type LibraryIndexEntry } from "@/lib/projects/projectFiles";
import { isUnverifiedAnswer } from "@/lib/messages/messageBlocks";
import type { ChatTurn } from "@/lib/messages/conversation";

// The index is in every prompt of a chat, so very long chats list only the files written last.
const MAX_INDEXED_FILES = 20;

/** `turn` is the index in the turns the files were read from; `block` the artifact's place among that turn's closed blocks. */
export type ChatFileVersion = { turn: number; block: number; content: string };

export type ChatFile = { path: string; title: string; type: ArtifactType; versions: ChatFileVersion[] };

function addVersion(files: Map<string, ChatFile>, artifact: Artifact, turn: number, block: number): string {
  // Blocks from before chat files have no path: they get one in history order, as they would have when written.
  const path = artifact.path ? artifactPath(artifact) : libraryPath(artifact, new Set(files.keys()));
  const file = files.get(path) ?? { path, title: artifact.title, type: artifact.type, versions: [] };
  file.title = artifact.title;
  file.versions.push({ turn, block, content: artifact.content });
  files.set(path, file);
  return path;
}

/** The chat's files with their versions, oldest first. Unverified answers and changes that didn't apply are no version. */
export function chatFiles(turns: ChatTurn[]): Map<string, ChatFile> {
  const files = new Map<string, ChatFile>();
  turns.forEach((turn, index) => {
    if (turn.role !== "assistant" || isUnverifiedAnswer(turn.content)) return;
    parseArtifacts(turn.content).artifacts.forEach((artifact, block) => {
      if (!artifact.streaming && !artifact.edit && !artifact.reason) addVersion(files, artifact, index, block);
    });
  });
  return files;
}

/**
 * Runs a finished answer's artifacts against the chat's files before the message is saved: each gets the path of the file
 * it writes, an edit becomes the whole new version, and several blocks for one file become one version, so every message
 * holds complete versions. An unverified answer changes nothing.
 */
export function resolveChatArtifacts(content: string, history: ChatTurn[]): string {
  if (isUnverifiedAnswer(content)) return content;
  const closed = parseArtifacts(content).artifacts.filter((a) => !a.streaming);
  if (closed.length === 0) return content;
  const latest = [...chatFiles(history).values()].map((f) => [f.path, f.versions[f.versions.length - 1].content] as const);
  const writes = planWrites(closed, new Map(latest), "the file isn't in this chat");
  const attrs = writes.map((w): Record<string, string | null> | null => {
    if (w.kind === "merged") return null;
    if (w.kind === "failed") return { reason: w.reason };
    return { path: w.path, mode: null, changes: w.changes === undefined ? null : String(w.changes) };
  });
  const bodies = writes.map((w, i) => (w.kind === "merged" ? null : w.kind === "write" && w.content !== closed[i].content ? w.content : undefined));
  return setArtifactAttrs(content, attrs, bodies);
}

/**
 * What the model reads: the latest version of each file stays, naming its path, and an earlier one becomes a note outside
 * any tag. An artifact tag holding a stand-in instead of text taught the model to write its own.
 */
export function collapseOldVersions<T extends ChatTurn>(turns: T[]): T[] {
  const changes = new Map<number, { attrs: Record<string, string>[]; notes: string[] }>();
  for (const file of chatFiles(turns).values()) {
    file.versions.forEach((version, i) => {
      const change = changes.get(version.turn) ?? { attrs: [], notes: [] };
      if (i < file.versions.length - 1) change.notes[version.block] = `[Karui wrote v${i + 1} of ${file.path} here; a later version follows.]`;
      else change.attrs[version.block] = { path: file.path };
      changes.set(version.turn, change);
    });
  }
  return turns.map((turn, index) => {
    const change = changes.get(index);
    if (!change) return turn;
    return { ...turn, content: replaceArtifactBlocks(setArtifactAttrs(turn.content, change.attrs), (block) => change.notes[block]) };
  });
}

/** The latest version of each file, for `<read>` when it is no longer in the context. Keyed by path. */
export function chatFileIndex(turns: ChatTurn[]): { files: LibraryIndexEntry[]; contents: Map<string, string> } {
  const latest = [...chatFiles(turns).values()]
    .map((file) => ({ file, version: file.versions[file.versions.length - 1] }))
    .sort((a, b) => b.version.turn - a.version.turn)
    .slice(0, MAX_INDEXED_FILES);
  return {
    files: latest.map(({ file, version }) => ({ id: file.path, path: file.path, size: byteSize(version.content), preview: file.title })),
    contents: new Map(latest.map(({ file, version }) => [file.path, version.content])),
  };
}
