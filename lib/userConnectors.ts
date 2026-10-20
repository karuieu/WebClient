// The user's MCP connectors live on this device only, encrypted with the account's AES key in localStorage, until the backend supports them.

import { encryptMessage, decryptMessage } from "./crypto";
import { ensureAesKey, getUser, onSessionCleared } from "./session";
import { listTools, forgetServer, type McpServer, type McpTool } from "./mcpClient";
import { isExpiring, refreshGrant, signIn, type OAuthGrant } from "./mcpOAuth";
import type { ConnectorInfo, ConnectorRoute, GoogleConnector } from "./connectors";
import { googleRequest, googleTools } from "./googleWorkspace";

const STORAGE_PREFIX = "karui-connectors:";
export const CONNECTORS_UPDATED_EVENT = "karui-connectors-updated";

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
  catalogId?: string;
  api?: GoogleConnector;
  googleAccountId?: string;
  token?: string;
  oauth?: OAuthGrant;
  signedOut?: boolean;
  tools: UserConnectorTool[];
  addedAt: string;
  documents?: Record<string, GoogleDocument>;
};

export type GoogleDocument = { id: string; revisionId?: string };

let cache: { userId: string; list: UserConnector[] } | null = null;

onSessionCleared(() => {
  cache = null;
});

// Another tab may have refreshed a token: OAuth servers rotate refresh tokens, and writing back a stale one would
// revoke the whole sign-in.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(STORAGE_PREFIX)) cache = null;
  });
}

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

async function withLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return run();
  return navigator.locks.request(name, run);
}

export async function loadConnectors(options: { fresh?: boolean } = {}): Promise<UserConnector[]> {
  const user = getUser();
  const storage = storageKey();
  if (!user || !storage) return [];
  if (!options.fresh && cache?.userId === user.id) return cache.list;

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

// Every write starts from what is stored now, under a lock shared by all tabs.
async function mutate(change: (list: UserConnector[]) => UserConnector[]): Promise<UserConnector[]> {
  const user = getUser();
  const storage = storageKey();
  if (!user || !storage) throw new Error("You're signed out.");
  return withLock(storage, async () => {
    const list = change(await loadConnectors({ fresh: true }));
    const ciphertext = await encryptMessage(await requireKey(), JSON.stringify(list));
    localStorage.setItem(storage, ciphertext);
    cache = { userId: user.id, list };
    window.dispatchEvent(new Event(CONNECTORS_UPDATED_EVENT));
    return list;
  });
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

// Takes the token lock and re-reads the stored grant, so tabs never refresh the same grant twice.
async function refreshToken(id: string, staleToken: string): Promise<string | null> {
  return withLock(`${STORAGE_PREFIX}token:${id}`, async () => {
    const connector = (await loadConnectors({ fresh: true })).find((c) => c.id === id);
    if (!connector?.oauth || connector.signedOut) return null;
    if (connector.oauth.accessToken !== staleToken && !isExpiring(connector.oauth)) return connector.oauth.accessToken;
    const grant = await refreshGrant(connector.oauth, connector.route);
    await mutate((list) => list.map((c) => (c.id !== id ? c : grant ? { ...c, oauth: grant } : { ...c, signedOut: true })));
    return grant?.accessToken ?? null;
  });
}

export async function serverFor(connector: UserConnector): Promise<McpServer | null> {
  const { id, url, route, oauth } = connector;
  if (!oauth) return { url, route, token: connector.token };
  if (connector.signedOut) return null;
  const token = isExpiring(oauth) ? await refreshToken(id, oauth.accessToken) : oauth.accessToken;
  return token ? { url, route, token, refreshToken: () => refreshToken(id, token) } : null;
}

export async function addConnector(input: {
  name: string;
  url: string;
  route: ConnectorRoute;
  token?: string;
}): Promise<UserConnector> {
  const token = input.token?.trim() || undefined;
  const tools = await listTools({ url: input.url, route: input.route, token });
  const connector: UserConnector = {
    id: crypto.randomUUID(),
    name: input.name,
    url: input.url,
    route: input.route,
    token,
    tools: snapshotTools(tools),
    addedAt: new Date().toISOString(),
  };
  await mutate((list) => [...list, connector]);
  return connector;
}

// Signing in again keeps the connector's id, so projects that use it keep it.
export async function connectCatalogConnector(input: {
  info: ConnectorInfo;
  route: ConnectorRoute;
  popup: Window;
  signal: AbortSignal;
}): Promise<UserConnector[]> {
  const { info, route, popup, signal } = input;
  const existing = (await loadConnectors({ fresh: true })).find((c) => c.catalogId === info.id);
  const oauth = await signIn({ name: info.name, serverUrl: info.url, route, app: info.app, api: info.api, scopes: info.scopes, previous: existing?.oauth, popup, signal });
  signal.throwIfAborted();
  const tools = info.api ? googleTools(info.api) : await listTools({ url: info.url, route, token: oauth.accessToken });
  let googleAccountId: string | undefined;
  if (info.api === "docs") {
    const account = await googleRequest({ url: info.url, route, token: oauth.accessToken }, "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)") as { user?: { permissionId?: string } };
    googleAccountId = account.user?.permissionId;
    if (!googleAccountId) throw new Error("Google didn't identify this Drive account. Try connecting again.");
  }
  signal.throwIfAborted();
  const connector: UserConnector = {
    id: existing?.id ?? crypto.randomUUID(),
    catalogId: info.id,
    api: info.api,
    googleAccountId,
    name: info.name,
    url: info.url,
    route,
    oauth,
    tools: snapshotTools(tools),
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    documents: googleAccountId && googleAccountId === existing?.googleAccountId ? existing.documents : undefined,
  };
  return mutate((list) => (existing ? list.map((c) => (c.id === existing.id ? connector : c)) : [...list, connector]));
}

export async function updateConnector(id: string, patch: Partial<Pick<UserConnector, "name" | "route" | "tools">>): Promise<UserConnector[]> {
  return mutate((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export async function refreshConnectorTools(id: string): Promise<UserConnector[]> {
  const connector = (await loadConnectors()).find((c) => c.id === id);
  const server = connector && (await serverFor(connector));
  if (!server) return loadConnectors();
  const tools = connector.api ? googleTools(connector.api) : await listTools(server);
  return updateConnector(id, { tools: snapshotTools(tools) });
}

export async function saveGoogleDocument(connectorId: string, artifactId: string, document: GoogleDocument): Promise<void> {
  await mutate((list) => {
    const connector = list.find((c) => c.id === connectorId && c.api === "docs");
    if (!connector) throw new Error("This Google Docs connection was removed. Connect it again before saving.");
    return list.map((c) => c.id === connectorId ? { ...c, documents: { ...c.documents, [artifactId]: document } } : c);
  });
}

export async function removeConnector(id: string): Promise<UserConnector[]> {
  const removed = (await loadConnectors()).find((c) => c.id === id);
  if (removed) forgetServer({ url: removed.url, token: removed.oauth?.accessToken ?? removed.token });
  return mutate((list) => list.filter((c) => c.id !== id));
}
