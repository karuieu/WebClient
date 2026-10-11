/**
 * Next inlines NEXT_PUBLIC_API_URL at build time; configure it where next build runs, not at server
 * startup.   Allow the localhost fallback only for development.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

/**
 * The session is an HttpOnly cookie on the API host, and fetch sends cookies to another origin only with
 * credentials: "include". NEAR's SDK calls the global fetch and has no option for that, so the page's fetch adds it
 * to every request to the API. Requests anywhere else (MCP servers, Cap) are left alone.
 */
function sendCookiesToAPI(): void {
  if (typeof window === "undefined") return;
  const native = window.fetch;
  if ((native as { karuiCookies?: boolean }).karuiCookies) return;
  const apiOrigin = new URL(API_URL).origin;
  const withCookies = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== apiOrigin) return native.call(window, input, init);
    const send = () => native.call(window, input, { ...init, credentials: "include" });
    // A Request's body can't be sent twice, so only plain URLs go through the confirmation below.
    if (input instanceof Request) return send();
    const response = await send();
    const request = await identityRequest(response);
    if (!request) return response;
    if (!(await confirmIdentity(request))) throw new NotConfirmedError(request.purpose);
    return send();
  };
  window.fetch = Object.assign(withCookies, { karuiCookies: true });
}

/**
 * Settings → Security → Ask before deleting: the server answers a deletion (or a change of that setting) with 403
 * until the user confirms their password or a code. The page's fetch then asks through ConfirmIdentityHost and, once
 * confirmed, sends the same request again, so no caller has to handle it.
 */
export type IdentityRequest = { check: "password" | "two_factor"; purpose: "delete" | "settings" };

/** The user closed "Confirm it's you", so the deletion (or settings change) was not sent again. */
export class NotConfirmedError extends Error {
  constructor(purpose: IdentityRequest["purpose"]) {
    super(purpose === "settings" ? "Not changed. Confirm it's you to change this." : "Not deleted. Confirm it's you to delete this.");
    this.name = "NotConfirmedError";
  }
}

export function deletionErrorText(error: unknown, fallback: string): string {
  return error instanceof NotConfirmedError ? error.message : fallback;
}

type IdentityState = {
  handler: ((request: IdentityRequest) => Promise<boolean>) | null;
  asking: { check: IdentityRequest["check"]; answer: Promise<boolean> } | null;
};

// Shared by every copy of this module: fetch is wrapped only once, and a reloaded module (dev) must still reach it.
const identity: IdentityState = ((globalThis as { karuiIdentity?: IdentityState }).karuiIdentity ??= { handler: null, asking: null });

export function setIdentityHandler(next: IdentityState["handler"]): void {
  identity.handler = next;
}

// Deletions sent together (several chats at once) share one dialog; a different check waits for it to close.
function confirmIdentity(request: IdentityRequest): Promise<boolean> {
  const { asking } = identity;
  if (asking?.check === request.check) return asking.answer;
  const answer: Promise<boolean> = (asking?.answer ?? Promise.resolve(false))
    .then(() => identity.handler?.(request) ?? false)
    .catch(() => false)
    .finally(() => {
      if (identity.asking?.answer === answer) identity.asking = null;
    });
  identity.asking = { check: request.check, answer };
  return answer;
}

async function identityRequest(response: Response): Promise<IdentityRequest | null> {
  if (response.status !== 403) return null;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (!body || typeof body !== "object") return null;
  const { code, check, purpose } = body as Record<string, unknown>;
  if (code !== "confirmation_required" || (check !== "password" && check !== "two_factor")) return null;
  return { check, purpose: purpose === "settings" ? "settings" : "delete" };
}

sendCookiesToAPI();

export function isLoopbackAPIURL(): boolean {
  let host: string;
  try {
    host = new URL(API_URL).hostname;
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

export function isSecureAPIURL(): boolean {
  return API_URL.startsWith("https://");
}

/**
 * Require HTTPS for attestation proxies to prevent report and key substitution.   Allow HTTP only for
 * development loopback; production localhost is still a configuration error.
 */
export function assertProxiedAPIURL(what: string): void {
  if (isSecureAPIURL()) return;
  if (!IS_PRODUCTION_BUILD && isLoopbackAPIURL()) return;

  throw new Error(
    `NEXT_PUBLIC_API_URL must use HTTPS so that ${what} goes through the Karui proxy. Got: ${API_URL}`
  );
}

export const JSON_HEADERS: HeadersInit = { "Content-Type": "application/json" };

// Bound stalled API reads at 30s; allow writes past the backend's 2-minute upload timeout so it enforces
// the limit first.
const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 150_000;

/** Bound ordinary API calls, not model streams; callers with their own signal manage timeout themselves. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const signal = init.signal ?? AbortSignal.timeout(method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("Karui took too long to answer. Please try again.");
    }
    // fetch rejects with a TypeError only when no response arrived at all.
    if (error instanceof TypeError) throw new Error("Can't reach Karui. Check your connection and try again.");
    throw error;
  }
}

/** A JSON call to our API that throws the server's error message. */
export async function apiJSON<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...JSON_HEADERS, ...options.headers },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `HTTP error ${response.status} ${response.statusText}`);
  }
  if (response.status === 204) return null as unknown as T;
  return response.json();
}
