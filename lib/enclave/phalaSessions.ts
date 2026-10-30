import { API_URL, apiFetch } from "@/lib/core/api";
import { tinfoilFingerprint } from "./tinfoilVerifier";

const TINFOIL_VERIFIER = "private-ai-verifier/tinfoil/v1";
const TINFOIL_ORIGIN = "https://inference.tinfoil.sh";
// A session this close to expiring may be gone when the request lands; the proxy uses the same margin.
const EXPIRY_MARGIN_SECONDS = 120;

interface ListedSession {
  session_id: string;
  verifier_id: string;
  expires_at: number;
}

interface ChannelBinding {
  type?: string;
  origin?: string;
  spki_sha256?: string;
}

const pinned = new Map<string, { ids: string[]; staleAfter: number }>();

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(`${API_URL}/api/phala${path}`);
  if (!response.ok) throw new Error("Could not fetch Phala's verified hosts");
  return (await response.json()) as T;
}

// The record comes through our API, so its id is recomputed: a record whose id is its own hash can't be swapped.
async function routesToVerifiedTinfoil(id: string, fingerprint: string): Promise<boolean> {
  const record = await getJson<{ api_version?: string; verifier_id?: string; channel_binding?: ChannelBinding[] }>(`/sessions/${id}`);
  const { computeSessionId, checkSessionApiVersion } = await import("@phala/aci-verifier");
  if ((await computeSessionId(record)) !== id || !checkSessionApiVersion({ api_version: record.api_version ?? "" })) return false;
  return (
    record.verifier_id === TINFOIL_VERIFIER &&
    (record.channel_binding ?? []).some(
      (b) => b.type === "tls_spki_sha256" && b.origin === TINFOIL_ORIGIN && b.spki_sha256?.toLowerCase() === fingerprint
    )
  );
}

// Empty when the gateway has no Tinfoil host for the model (Qwen runs on Phala's own); the proxy then picks one.
export async function tinfoilSessionIds(model: string): Promise<string[]> {
  const now = Date.now() / 1000;
  const cached = pinned.get(model);
  if (cached && cached.staleAfter > now) return cached.ids;

  const { sessions } = await getJson<{ sessions?: ListedSession[] }>(`/sessions?model=${encodeURIComponent(model)}`);
  const live = (sessions ?? []).filter((s) => s.verifier_id === TINFOIL_VERIFIER && s.expires_at > now + EXPIRY_MARGIN_SECONDS);
  if (live.length === 0) return [];

  const fingerprint = await tinfoilFingerprint();
  const checked = await Promise.all(live.map(async (s) => ((await routesToVerifiedTinfoil(s.session_id, fingerprint)) ? s : null)));
  const verified = checked.filter((s): s is ListedSession => s !== null);
  if (verified.length === 0) throw new Error("Tinfoil's attestation didn't verify in your browser, so nothing was sent.");

  const ids = verified.map((s) => s.session_id);
  pinned.set(model, { ids, staleAfter: Math.min(...verified.map((s) => s.expires_at)) - EXPIRY_MARGIN_SECONDS });
  return ids;
}

// After a 412 the gateway has re-verified its hosts; the next send picks fresh sessions.
export function forgetTinfoilSessions(model: string): void {
  pinned.delete(model);
}
