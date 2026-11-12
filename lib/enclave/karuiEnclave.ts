// Calls Karui's own enclave. Before anything is sent the browser verifies the enclave's attestation (karuiAttestation.ts)
// and from then on encrypts every call to the attested key (karuiChannel.ts). Our server passes the calls on and signs
// which account is asking; it cannot read a call or its answer, and the enclave answers each one once.

import { onSessionCleared } from "@/lib/account/session";
import { API_URL, IS_PRODUCTION_BUILD, JSON_HEADERS, apiFetch, apiJSON } from "@/lib/core/api";
import { fromHex, toHex } from "./hex";
import { verifyEvidence, type Evidence } from "./karuiAttestation";
import { openReply, seal, type SealedReply } from "./karuiChannel";
import { ACCEPTED_MEASUREMENTS, AMD_ROOTS } from "./karuiEnclaveTrust";

const NONCE_SIZE = 32;
const VERIFIED_FOR_MS = 60 * 60 * 1000;
// The enclave ends a session after an hour or 4096 calls and says so with this.
const SESSION_EXPIRED = "session expired";
// The enclave's answer to a request it cannot open: it restarted and holds a new key.
const NOT_OPENED_STATUS = 400;

type Call = { method: string; session?: string; params?: unknown };
type Result = { value?: unknown; error?: string };
type Enclave = { key: Uint8Array; staleAfter: number; session: Promise<string> | null };

class EnclaveRestarted extends Error {}

let enclave: Enclave | null = null;
let verifying: Promise<Enclave> | null = null;

// A session belongs to the account that opened it.
onSessionCleared(() => {
  enclave = null;
  verifying = null;
});

async function revocationList(generation: string): Promise<Uint8Array> {
  const response = await apiFetch(`${API_URL}/api/enclave/revocations/${encodeURIComponent(generation)}`);
  if (!response.ok) throw new Error(`AMD's revocation list answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function verify(): Promise<Enclave> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  // The attestation is the enclave's own, passed on by our server: a failure to get it is told apart from one to verify it.
  const evidence = await apiJSON<Evidence>(`/api/enclave/attestation?nonce=${toHex(nonce)}`);
  try {
    const verified = await verifyEvidence(evidence, {
      nonce,
      measurements: ACCEPTED_MEASUREMENTS.map(fromHex),
      roots: AMD_ROOTS,
      revocationList,
      now: new Date(),
      allowDev: !IS_PRODUCTION_BUILD,
    });
    return { key: verified.publicKey, staleAfter: Date.now() + VERIFIED_FOR_MS, session: null };
  } catch (error) {
    console.warn("[karui] enclave attestation:", error);
    throw new Error("Karui's enclave didn't verify in your browser, so nothing was sent.");
  }
}

function verifiedEnclave(): Promise<Enclave> {
  if (enclave && enclave.staleAfter > Date.now()) return Promise.resolve(enclave);
  if (!verifying) {
    const run = verify()
      .then((fresh) => (enclave = fresh))
      .finally(() => {
        if (verifying === run) verifying = null;
      });
    verifying = run;
  }
  return verifying;
}

async function send(to: Enclave, call: Call): Promise<Result> {
  const { request, replyKey } = await seal(to.key, new TextEncoder().encode(JSON.stringify(call)));
  const response = await apiFetch(`${API_URL}/api/enclave/channel`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request) });
  if (response.status === NOT_OPENED_STATUS) throw new EnclaveRestarted();
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Karui's enclave isn't available.");
  }
  try {
    const answer = await openReply(replyKey, (await response.json()) as SealedReply);
    return JSON.parse(new TextDecoder().decode(answer)) as Result;
  } catch {
    // Only the enclave that holds the attested key can seal a reply to this request.
    throw new Error("The answer didn't come from Karui's enclave, so it was dropped.");
  }
}

async function openSession(to: Enclave): Promise<string> {
  const result = await send(to, { method: "session" });
  if (typeof result.value !== "string") throw new Error(result.error || "Karui's enclave didn't open a session.");
  return result.value;
}

function sessionOf(to: Enclave): Promise<string> {
  if (!to.session) {
    const opening = openSession(to);
    opening.catch(() => {
      if (to.session === opening) to.session = null;
    });
    to.session = opening;
  }
  return to.session;
}

async function attempt(method: string, params: unknown): Promise<Result | "again"> {
  const to = await verifiedEnclave();
  try {
    const session = sessionOf(to);
    const result = await send(to, { method, session: await session, params });
    if (result.error !== SESSION_EXPIRED) return result;
    if (to.session === session) to.session = null;
  } catch (error) {
    if (!(error instanceof EnclaveRestarted)) throw error;
    // A new key needs a new attestation.
    if (enclave === to) enclave = null;
  }
  return "again";
}

// enclaveCall runs one call in the enclave and returns its value. An ended session or a restarted enclave gets one
// more try, on a new session or a newly verified key.
export async function enclaveCall<T>(method: string, params: unknown): Promise<T> {
  let result = await attempt(method, params);
  if (result === "again") result = await attempt(method, params);
  if (result === "again") throw new Error("Karui's enclave isn't available.");
  if (result.error) throw new Error(result.error);
  return result.value as T;
}
