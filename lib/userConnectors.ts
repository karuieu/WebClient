// The user's MCP connectors live on this device only, encrypted with the account's AES key in localStorage, until the backend supports them.

import { encryptMessage, decryptMessage } from "./crypto";
import { ensureAesKey, getUser, onSessionCleared } from "./session";
import { listTools, forgetServer, type McpTool } from "./mcpClient";
import type { ConnectorRoute } from "./connectors";

const STORAGE_PREFIX = "karui-connectors:";

export type UserConnectorTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  readOnly: boolean;
};

export type UserConnector = {
  id: string;
  name: string;
  url: string;
  route: ConnectorRoute;
  token?: string;
  tools: UserConnectorTool[];
  addedAt: string;
};

let cache: { userId: string; list: UserConnector[] } | null = null;

onSessionCleared(() => {
  cache = null;
});

function storageKey(): string | null {
  const user = getUser();
  return user ? `${STORAGE_PREFIX}${user.id}` : null;
}

async function requireKey(): Promise<CryptoKey> {
  const key = await ensureAesKey();
  if (!key) throw new Error("Encryption key unavailable — please sign in again.");
  return key;
}

function isConnector(value: unknown): value is UserConnector {
  const c = value as UserConnector | null;
  return !!c && typeof c.id === "string" && typeof c.name === "string" && typeof c.url === "string" && Array.isArray(c.tools);
}

export async function loadConnectors(): Promise<UserConnector[]> {
  const user = getUser();
  const storage = storageKey();
  if (!user || !storage) return [];
  if (cache?.userId === user.id) return cache.list;

  let list: UserConnector[] = [];
  try {
    const stored = localStorage.getItem(storage);
    if (stored) {
      const parsed: unknown = JSON.parse(await decryptMessage(await requireKey(), stored));
      if (Array.isArray(parsed)) list = parsed.filter(isConnector);
    }
  } catch {
    list = [];
  }
  cache = { userId: user.id, list };
  return list;
}

async function save(list: UserConnector[]): Promise<void> {
  const user = getUser();
  const storage = storageKey();
  if (!user || !storage) throw new Error("You're signed out.");
  const ciphertext = await encryptMessage(await requireKey(), JSON.stringify(list));
  localStorage.setItem(storage, ciphertext);
  cache = { userId: user.id, list };
}

export function snapshotTools(tools: McpTool[]): UserConnectorTool[] {
  return tools.map((t) => ({
    name: t.name,
    title: t.title ?? t.annotations?.title,
    description: t.description,
    inputSchema: t.inputSchema,
    readOnly: t.annotations?.readOnlyHint === true,
  }));
}

export async function addConnector(input: {
  name: string;
  url: string;
  route: ConnectorRoute;
  token?: string;
}): Promise<UserConnector> {
  const token = input.token?.trim() || undefined;
  const tools = await listTools({ url: input.url, token });
  const connector: UserConnector = {
    id: crypto.randomUUID(),
    name: input.name,
    url: input.url,
    route: input.route,
    token,
    tools: snapshotTools(tools),
    addedAt: new Date().toISOString(),
  };
  await save([...(await loadConnectors()), connector]);
  return connector;
}

export async function updateConnector(id: string, patch: Partial<Pick<UserConnector, "name" | "route" | "tools">>): Promise<UserConnector[]> {
  const list = (await loadConnectors()).map((c) => (c.id === id ? { ...c, ...patch } : c));
  await save(list);
  return list;
}

export async function refreshConnectorTools(id: string): Promise<UserConnector[]> {
  const connector = (await loadConnectors()).find((c) => c.id === id);
  if (!connector) return loadConnectors();
  const tools = await listTools({ url: connector.url, token: connector.token });
  return updateConnector(id, { tools: snapshotTools(tools) });
}

export async function removeConnector(id: string): Promise<UserConnector[]> {
  const all = await loadConnectors();
  const removed = all.find((c) => c.id === id);
  if (removed) forgetServer({ url: removed.url, token: removed.token });
  const list = all.filter((c) => c.id !== id);
  await save(list);
  return list;
}
