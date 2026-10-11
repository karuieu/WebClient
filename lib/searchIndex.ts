// Search index of message text. Plaintext lives in memory only; IndexedDB holds the same text sealed with the user's AES key. Signing out deletes the database.

import { readChatMessages, type Chat, type Message } from "./chat";
import { visibleMessages } from "./conversation";
import { decryptMessage, encryptMessage } from "./crypto";
import { ensureAesKey, onSessionCleared } from "./session";
import { fold, matchesAll, messageSearchText } from "./searchText";

export type IndexedMessage = { id: string; role: "user" | "assistant"; text: string; folded: string };
export type IndexProgress = { done: number; total: number; paused: boolean };
export type IndexState = { version: number; progress: IndexProgress | null };

type IndexedChat = { updatedAt: string; messages: IndexedMessage[] };
type StoredChat = { updatedAt: string; sealed: string };
type StoredMessage = Pick<IndexedMessage, "id" | "role" | "text">;

const DB_NAME = "karui-search";
const STORE = "chats";
const BATCH = 50;

const index = new Map<string, IndexedChat>();
let loaded = false;
let running = false;
let queued: Chat[] | null = null;
// Bumped on sign-out so a sync still in flight can't write into the next session.
let generation = 0;

let state: IndexState = { version: 0, progress: null };
const listeners = new Set<() => void>();

function emit(progress: IndexProgress | null): void {
  state = { version: state.version + 1, progress };
  listeners.forEach((l) => l());
}

export function subscribeSearchIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSearchIndexState(): IndexState {
  return state;
}

const hasDB = (): boolean => typeof indexedDB !== "undefined";

function openDB(): Promise<IDBDatabase> | null {
  if (!hasDB()) return null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function readStored(): Promise<Map<string, StoredChat>> {
  const out = new Map<string, StoredChat>();
  await withStore("readonly", (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      out.set(String(cursor.key), cursor.value as StoredChat);
      cursor.continue();
    };
  });
  return out;
}

function isStoredMessage(v: unknown): v is StoredMessage {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string";
}

function indexed(messages: StoredMessage[]): IndexedMessage[] {
  return messages.map((m) => ({ ...m, folded: fold(m.text) }));
}

async function loadStored(key: CryptoKey): Promise<void> {
  const stored = await readStored().catch(() => new Map<string, StoredChat>());
  const broken: string[] = [];
  await Promise.all(
    [...stored].map(async ([id, record]) => {
      try {
        const parsed: unknown = JSON.parse(await decryptMessage(key, record.sealed));
        if (!Array.isArray(parsed) || !parsed.every(isStoredMessage)) throw new Error("bad record");
        index.set(id, { updatedAt: record.updatedAt, messages: indexed(parsed) });
      } catch {
        broken.push(id);
      }
    }),
  );
  if (broken.length) await withStore("readwrite", (store) => broken.forEach((id) => store.delete(id))).catch(() => {});
}

async function save(key: CryptoKey, entries: [string, IndexedChat][]): Promise<void> {
  if (!hasDB()) return;
  const records = await Promise.all(
    entries.map(async ([id, chat]) => {
      const plain: StoredMessage[] = chat.messages.map(({ id, role, text }) => ({ id, role, text }));
      return [id, { updatedAt: chat.updatedAt, sealed: await encryptMessage(key, JSON.stringify(plain)) }] as const;
    }),
  );
  await withStore("readwrite", (store) => records.forEach(([id, record]) => store.put(record, id)));
}

const stamp = (c: Chat): string => c.updated_at ?? c.created_at;

export async function syncSearchIndex(chats: Chat[]): Promise<void> {
  if (running) {
    queued = chats;
    return;
  }
  running = true;
  try {
    await run(chats);
  } finally {
    running = false;
  }
  const next = queued;
  queued = null;
  if (next) await syncSearchIndex(next);
}

async function run(chats: Chat[]): Promise<void> {
  const gen = generation;
  const key = await ensureAesKey();
  if (!key || gen !== generation) return;
  if (!loaded) {
    await loadStored(key);
    if (gen !== generation) return;
    loaded = true;
  }

  const live = new Set(chats.map((c) => c.id));
  const gone = [...index.keys()].filter((id) => !live.has(id));
  gone.forEach((id) => index.delete(id));
  if (gone.length) void withStore("readwrite", (store) => gone.forEach((id) => store.delete(id))).catch(() => {});

  const stale = chats.filter((c) => index.get(c.id)?.updatedAt !== stamp(c));
  const total = chats.length;
  let done = total - stale.length;
  if (!stale.length) {
    emit(null);
    return;
  }
  emit({ done, total, paused: false });

  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH);
    let fetched: Map<string, Message[]>;
    try {
      fetched = await readChatMessages(batch.map((c) => c.id));
    } catch {
      if (gen === generation) emit({ done, total, paused: true });
      return;
    }
    if (gen !== generation) return;

    const fresh: [string, IndexedChat][] = [];
    for (const c of batch) {
      const messages = fetched.get(c.id);
      if (!messages) {
        index.delete(c.id);
        continue;
      }
      const shown = visibleMessages(messages, {}).filter((m) => !m.decryptionFailed);
      const entry: IndexedChat = {
        updatedAt: stamp(c),
        messages: indexed(shown.map((m) => ({ id: m.id, role: m.role, text: messageSearchText(m.role, m.content) })).filter((m) => m.text)),
      };
      index.set(c.id, entry);
      fresh.push([c.id, entry]);
    }
    void save(key, fresh).catch(() => {});
    done += batch.length;
    emit({ done, total, paused: false });
  }
  emit(null);
}

export type MessageGroup = { chatId: string; hits: IndexedMessage[]; more: number };

export function searchMessages(terms: string[], chatIds: string[], perChat = 3, maxChats = 30): MessageGroup[] {
  const groups: MessageGroup[] = [];
  if (!terms.length) return groups;
  for (const chatId of chatIds) {
    const chat = index.get(chatId);
    if (!chat) continue;
    const hits = chat.messages.filter((m) => matchesAll(m.folded, terms));
    if (!hits.length) continue;
    groups.push({ chatId, hits: hits.slice(0, perChat), more: hits.length - Math.min(hits.length, perChat) });
    if (groups.length === maxChats) break;
  }
  return groups;
}

onSessionCleared(() => {
  generation++;
  index.clear();
  loaded = false;
  queued = null;
  emit(null);
  if (hasDB()) indexedDB.deleteDatabase(DB_NAME);
});
