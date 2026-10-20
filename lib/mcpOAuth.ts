// OAuth sign-in for MCP connectors, following the MCP authorization spec: protected resource metadata, PKCE, and a
// client registered on the fly (DCR) or described by our client metadata document. Every request goes through the
// connector's route, so the app's connect-src stays locked to our API. Apps that need Karui's client secret ('app')
// exchange codes on our server.

import { apiJSON } from "./api";
import type { ConnectorApp, ConnectorRoute, GoogleConnector } from "./connectors";
import { connectorFetch, fromServer, type ServerReply } from "./connectorRelay";
import type { RelayResponse } from "./mcpSandbox";

export type OAuthGrant = {
  clientId: string;
  // Some servers issue a secret even to a client that registered without one.
  clientSecret?: string;
  tokenEndpoint: string;
  resource?: string;
  app?: ConnectorApp;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export const SIGN_IN_CHANNEL = "karui-connector-sign-in";
export const CALLBACK_PATH = "/connectors/callback";
const CLIENT_METADATA_URL = "https://karui.eu/oauth/client.json";
const SIGN_IN_TIMEOUT_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 60_000;

// Google returns a refresh token only for offline access, and only on a fresh consent.
const AUTHORIZE_EXTRAS: Partial<Record<ConnectorApp, Record<string, string>>> = {
  google: { access_type: "offline", prompt: "consent" },
};

type ResourceMetadata = { resource?: string; authorization_servers?: string[]; scopes_supported?: string[] };

type ServerMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  client_id_metadata_document_supported?: boolean;
};

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

export type SignInRequest = {
  name: string;
  serverUrl: string;
  route: ConnectorRoute;
  app?: ConnectorApp;
  api?: GoogleConnector;
  scopes?: string;
  previous?: OAuthGrant;
  popup: Window;
  signal: AbortSignal;
};

export function redirectUri(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

// Opened straight from the click, before any await, so pop-up blockers let it through.
export function openSignInWindow(): Window | null {
  return window.open("about:blank", SIGN_IN_CHANNEL, "popup,width=520,height=720");
}

export function isExpiring(grant: OAuthGrant): boolean {
  return grant.expiresAt !== undefined && grant.expiresAt - Date.now() < REFRESH_MARGIN_MS;
}

function parseJSON(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function getJSON(route: ConnectorRoute, url: string): Promise<unknown> {
  try {
    const res = await connectorFetch(route, { url, method: "GET", headers: { Accept: "application/json" } });
    return res.status === 200 ? parseJSON(res.body) : null;
  } catch {
    return null;
  }
}

export function parseChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [, key, value] of header.matchAll(/(\w+)="([^"]*)"/g)) params[key] = value;
  return params;
}

function isResourceMetadata(value: unknown): value is ResourceMetadata {
  return !!value && typeof value === "object" && Array.isArray((value as ResourceMetadata).authorization_servers);
}

function isServerMetadata(value: unknown): value is ServerMetadata {
  const m = value as ServerMetadata | null;
  return !!m && typeof m.authorization_endpoint === "string" && typeof m.token_endpoint === "string";
}

function pathOf(url: URL): string {
  return url.pathname === "/" ? "" : url.pathname;
}

// The 401 to an unauthenticated call names the resource metadata; servers that answer without a token, or don't
// name it, are looked up at the well-known paths.
async function resourceMetadata(serverUrl: string, route: ConnectorRoute): Promise<{ metadata?: ResourceMetadata; scope?: string }> {
  let challenge: Record<string, string> = {};
  try {
    const res = await connectorFetch(route, {
      url: serverUrl,
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Karui", version: "1.0.0" } } }),
    });
    challenge = parseChallenge(res.wwwAuthenticate);
  } catch {
  }
  const url = new URL(serverUrl);
  const candidates = [
    challenge.resource_metadata,
    `${url.origin}/.well-known/oauth-protected-resource${pathOf(url)}`,
    `${url.origin}/.well-known/oauth-protected-resource`,
  ].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    const metadata = await getJSON(route, candidate);
    if (isResourceMetadata(metadata)) return { metadata, scope: challenge.scope };
  }
  return { scope: challenge.scope };
}

export function serverMetadataURLs(issuer: string): string[] {
  const url = new URL(issuer);
  const path = pathOf(url).replace(/\/$/, "");
  if (!path) return [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`];
  return [
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
    `${url.origin}/.well-known/openid-configuration${path}`,
    `${url.origin}${path}/.well-known/openid-configuration`,
  ];
}

async function serverMetadata(issuer: string, route: ConnectorRoute): Promise<ServerMetadata> {
  for (const candidate of serverMetadataURLs(issuer)) {
    const metadata = await getJSON(route, candidate);
    if (isServerMetadata(metadata)) return metadata;
  }
  throw new Error("Couldn't find where this app signs you in.");
}

type Client = { clientId: string; clientSecret?: string };

// Re-registering would orphan the grants made under the old client, so a client from an earlier sign-in is reused.
async function clientFor(request: SignInRequest, metadata: ServerMetadata, route: ConnectorRoute): Promise<Client> {
  const { previous, app } = request;
  if (previous && previous.tokenEndpoint === metadata.token_endpoint) return { clientId: previous.clientId, clientSecret: previous.clientSecret };
  if (app) {
    const { client_ids } = await apiJSON<{ client_ids: Record<string, string> }>("/api/connectors/apps");
    if (!client_ids[app]) throw new Error(`Signing in to ${request.name} isn't set up yet.`);
    return { clientId: client_ids[app] };
  }
  // The document lists only the production callback, so other origins register instead.
  if (metadata.client_id_metadata_document_supported && window.location.origin === new URL(CLIENT_METADATA_URL).origin) {
    return { clientId: CLIENT_METADATA_URL };
  }
  if (!metadata.registration_endpoint) throw new Error(`${request.name} doesn't let Karui sign in on its own. Add it with a token instead.`);

  const res = await connectorFetch(route, {
    url: metadata.registration_endpoint,
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Karui",
      client_uri: window.location.origin,
      redirect_uris: [redirectUri()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const data = parseJSON(res.body) as { client_id?: unknown; client_secret?: unknown } | null;
  if (res.status >= 300 || typeof data?.client_id !== "string") throw new Error(`${request.name} didn't let Karui register for sign-in.`);
  return { clientId: data.client_id, clientSecret: typeof data.client_secret === "string" ? data.client_secret : undefined };
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function codeChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

function waitForCode(state: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(SIGN_IN_CHANNEL);
    const finish = () => {
      channel.close();
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new DOMException("Sign-in cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("Signing in took too long. Try again."));
    }, SIGN_IN_TIMEOUT_MS);
    channel.onmessage = (event: MessageEvent<{ state?: string; code?: string; error?: string; description?: string } | null>) => {
      if (event.data?.state !== state) return;
      finish();
      if (event.data.code) resolve(event.data.code);
      else reject(new Error(event.data.description || "The app didn't finish signing you in."));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

function tokenReply(res: RelayResponse): TokenReply & { ok: boolean; status: number } {
  const data = (parseJSON(res.body) ?? {}) as TokenReply;
  return { ...data, status: res.status, ok: res.status < 300 && typeof data.access_token === "string" && !data.error };
}

async function requestToken(grant: Pick<OAuthGrant, "app" | "clientId" | "clientSecret" | "tokenEndpoint">, route: ConnectorRoute, params: Record<string, string>) {
  if (grant.app) {
    const reply = await apiJSON<ServerReply>("/api/connectors/token", { method: "POST", body: JSON.stringify({ app: grant.app, ...params }) });
    return tokenReply(fromServer(reply));
  }
  const form = new URLSearchParams({ ...params, client_id: grant.clientId });
  if (grant.clientSecret) form.set("client_secret", grant.clientSecret);
  return tokenReply(
    await connectorFetch(route, {
      url: grant.tokenEndpoint,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
    })
  );
}

function withTokens(base: Omit<OAuthGrant, "accessToken">, reply: TokenReply): OAuthGrant {
  return {
    ...base,
    accessToken: reply.access_token as string,
    refreshToken: reply.refresh_token ?? base.refreshToken,
    expiresAt: typeof reply.expires_in === "number" ? Date.now() + reply.expires_in * 1000 : undefined,
  };
}

export async function signIn(request: SignInRequest): Promise<OAuthGrant> {
  const { popup, signal, app } = request;
  // Our app's metadata and tokens may not answer a browser, and those requests go through our server anyway.
  const route: ConnectorRoute = app ? "server" : request.route;

  const { metadata: resource, scope } = request.api ? {} : await resourceMetadata(request.serverUrl, route);
  const metadata: ServerMetadata = request.api
    ? { authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth", token_endpoint: "https://oauth2.googleapis.com/token" }
    : await serverMetadata(resource?.authorization_servers?.[0] ?? new URL(request.serverUrl).origin, route);
  const client = await clientFor(request, metadata, route);
  signal.throwIfAborted();
  if (popup.closed) throw new Error("The sign-in window was closed. Try again.");

  const verifier = randomToken();
  const state = randomToken();
  const resourceUrl = resource?.resource ?? request.serverUrl;
  const authorize = new URL(metadata.authorization_endpoint);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: redirectUri(),
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    ...(app ? AUTHORIZE_EXTRAS[app] : { resource: resourceUrl }),
  };
  const scopes = request.scopes ?? scope ?? resource?.scopes_supported?.join(" ");
  if (scopes) params.scope = scopes;
  for (const [key, value] of Object.entries(params)) authorize.searchParams.set(key, value);

  const code = waitForCode(state, signal);
  popup.location.href = authorize.toString();
  const base = { ...client, tokenEndpoint: metadata.token_endpoint, app, resource: app ? undefined : resourceUrl };
  const reply = await requestToken(base, route, {
    grant_type: "authorization_code",
    code: await code,
    code_verifier: verifier,
    redirect_uri: redirectUri(),
    ...(base.resource ? { resource: base.resource } : {}),
  });
  if (!reply.ok) throw new Error(reply.error_description || `${request.name} didn't accept the sign-in. Try again.`);
  if (request.api && reply.scope && request.scopes?.split(" ").some((s) => !reply.scope?.split(" ").includes(s))) {
    throw new Error(`Allow the requested permissions to connect ${request.name}.`);
  }
  return withTokens(base, reply);
}

// null means the grant is gone (no refresh token, or the app refused it) and the user has to sign in again. An app
// that is only down throws instead, so a passing outage doesn't sign anyone out.
export async function refreshGrant(grant: OAuthGrant, route: ConnectorRoute): Promise<OAuthGrant | null> {
  if (!grant.refreshToken) return null;
  const reply = await requestToken(grant, grant.app ? "server" : route, {
    grant_type: "refresh_token",
    refresh_token: grant.refreshToken,
    ...(grant.resource ? { resource: grant.resource } : {}),
  });
  if (reply.ok) return withTokens(grant, reply);
  if (reply.error || reply.status === 400 || reply.status === 401) return null;
  throw new Error("Couldn't renew the sign-in. Try again in a moment.");
}
