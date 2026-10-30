import nacl from "tweetnacl";
import type { AttestationReport, ReceiptEnvelope, WorkloadKeyset } from "@phala/aci-verifier";
import { onSessionCleared } from "@/lib/account/session";
import { API_URL, apiFetch, assertProxiedAPIURL } from "@/lib/core/api";
import { CALL_DRAIN_LIMIT_MS, createLoopGuard, REPETITION_NOTICE, type StopAt } from "@/lib/messages/repetition";
import { RateLimitError, StoppedError, UnverifiedAnswerError } from "@/lib/core/errors";
import { STOPPED_NOTICE } from "@/lib/messages/messageBlocks";
import { toHex } from "./hex";
import { parseToolResponse, withToolInstructions, type JsonTool, type ToolResponse } from "./jsonTools";
import { assertReviewedGateway } from "./phalaGateway";
import { forgetTinfoilSessions, tinfoilSessionIds } from "./phalaSessions";

export const PHALA_E2EE_ALGO = "x25519-aes-256-gcm-hkdf-sha256";
const HKDF_INFO = "aci.e2ee.v2.x25519";
const KEY_BYTES = 32;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error("Invalid hex from Phala");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Associated data is serialised as RFC 8785 (JCS): keys sorted; for strings and integers JSON.stringify gives the same output.

export function requestAad(model: string, field: string, nonce: string, ts: number): string {
  return JSON.stringify({ algo: PHALA_E2EE_ALGO, field, model, nonce, purpose: "aci.e2ee.request.v2", ts });
}

export function responseAad(model: string, id: string, field: string, nonce: string, ts: number): string {
  return JSON.stringify({ algo: PHALA_E2EE_ALGO, field, id, model, nonce, purpose: "aci.e2ee.response.v2", ts });
}

async function fieldKey(shared: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  // An all-zero secret means a low-order public key: the "encryption" would be
  // to a key everyone knows.
  if (shared.every((b) => b === 0)) throw new Error("Phala sent an invalid encryption key");
  const ikm = await crypto.subtle.importKey("raw", shared as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode(HKDF_INFO) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

export async function encryptField(plaintext: string, recipient: Uint8Array, aad: string): Promise<string> {
  const ephemeral = nacl.box.keyPair();
  const key = await fieldKey(nacl.scalarMult(ephemeral.secretKey, recipient), "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(aad) }, key, encoder.encode(plaintext))
  );
  const wire = new Uint8Array(KEY_BYTES + IV_BYTES + sealed.length);
  wire.set(ephemeral.publicKey, 0);
  wire.set(iv, KEY_BYTES);
  wire.set(sealed, KEY_BYTES + IV_BYTES);
  return toHex(wire);
}

export async function decryptField(hex: string, secret: Uint8Array, aad: string): Promise<string | null> {
  try {
    const wire = fromHex(hex);
    if (wire.length < KEY_BYTES + IV_BYTES + 16) return null;
    const key = await fieldKey(nacl.scalarMult(secret, wire.slice(0, KEY_BYTES)), "decrypt");
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: wire.slice(KEY_BYTES, KEY_BYTES + IV_BYTES), additionalData: encoder.encode(aad) },
      key,
      wire.slice(KEY_BYTES + IV_BYTES)
    );
    return decoder.decode(opened);
  } catch {
    return null;
  }
}

interface GatewayKey {
  hex: string;
  bytes: Uint8Array;
  // What the gateway's receipts must be signed under.
  keyset: WorkloadKeyset;
  keysetDigest: string;
}

// Responses are encrypted to this key. Per session, so the next account on the
// tab doesn't inherit it.
let clientKeys: nacl.BoxKeyPair | null = null;
let gatewayKey: (GatewayKey & { staleAfter: number }) | null = null;
let pendingGatewayKey: Promise<GatewayKey> | null = null;

onSessionCleared(() => {
  clientKeys = null;
  gatewayKey = null;
  pendingGatewayKey = null;
});

export function isPhalaVerified(): boolean {
  return gatewayKey !== null && gatewayKey.staleAfter > Math.floor(Date.now() / 1000);
}

function getClientKeys(): nacl.BoxKeyPair {
  clientKeys ??= nacl.box.keyPair();
  return clientKeys;
}

interface ReportExtras {
  attestation?: { freshness?: { stale_after?: number }; evidence?: { app_compose?: string } };
  service_capabilities?: { supported_e2ee_versions?: string[] };
}

// Checks the verifier cannot skip. Key custody (id-5) is not implemented by the library, and the TLS pin (id-6) is out of a browser's reach; encrypting to the verified key stands in for it.
const REQUIRED_CHECKS = ["id-1", "id-2", "id-3", "id-4", "policy-os"];

// Intel's quote collateral comes through /api/pccs, the only host the CSP allows. Intel signs it, so the relay cannot forge it.
async function verifiedGatewayKeyset(report: AttestationReport & ReportExtras, nonce: string): Promise<{ keyset: WorkloadKeyset; digest: string }> {

  const { reportTranscript } = await import("@phala/aci-verifier");
  const transcript = await reportTranscript(report, nonce, {
    pccsUrl: `${API_URL}/api/pccs`,
    requireProductionOs: true,
    online: true,
  });
  for (const id of REQUIRED_CHECKS) {
    const line = transcript.lines.find((l) => l.id === id);
    if (line?.status !== "pass") {
      console.warn("[karui] Phala attestation:", line ?? id);
      throw new Error("Phala's attestation didn't verify in your browser, so nothing was sent.");
    }
  }
  const { ok, keyset, workloadKeysetDigest } = transcript.verification;
  if (!ok || !keyset || !workloadKeysetDigest) {
    throw new Error("Phala's attestation didn't verify in your browser, so nothing was sent.");
  }
  // id-4 passed, so this is the compose measured into the quote.
  await assertReviewedGateway(report.attestation?.evidence?.app_compose);
  return { keyset, digest: workloadKeysetDigest };
}

// The prewarm and a send that starts before it finishes share one attestation.
function getGatewayKey(): Promise<GatewayKey> {
  if (gatewayKey && gatewayKey.staleAfter > Math.floor(Date.now() / 1000)) return Promise.resolve(gatewayKey);
  if (!pendingGatewayKey) {
    const pending = fetchGatewayKey().finally(() => {
      if (pendingGatewayKey === pending) pendingGatewayKey = null;
    });
    pendingGatewayKey = pending;
  }
  return pendingGatewayKey;
}

// Verified before the first send so it doesn't wait for attestation; a failure shows up on that send instead.
export function prewarmPhala(model: string): void {
  getGatewayKey().catch(() => {});
  tinfoilSessionIds(model).catch(() => {});
}

async function fetchGatewayKey(): Promise<GatewayKey> {
  const now = Math.floor(Date.now() / 1000);
  // Over plain http anyone on the way could swap the key for their own.
  assertProxiedAPIURL("attestation Phala");
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const response = await apiFetch(`${API_URL}/api/phala/attestation?nonce=${nonce}`);
  if (!response.ok) throw new Error("Could not fetch Phala's encryption key (attestation)");
  const report = (await response.json()) as AttestationReport & ReportExtras;

  if (!report.service_capabilities?.supported_e2ee_versions?.includes("2")) {
    throw new Error("Phala no longer offers the encryption Karui uses");
  }
  const { keyset, digest } = await verifiedGatewayKeyset(report, nonce);
  const entry = keyset.e2ee_public_keys.find((k) => k.algo === PHALA_E2EE_ALGO);
  if (!entry?.public_key) throw new Error("Phala's attestation has no browser encryption key");
  const bytes = fromHex(entry.public_key);
  if (bytes.length !== KEY_BYTES) throw new Error("Phala's encryption key has the wrong length");

  // Re-fetched once the report says it's stale, at the latest after an hour.
  const staleAfter = Math.min(report.attestation?.freshness?.stale_after ?? now + 3600, now + 3600);
  gatewayKey = { hex: toHex(bytes), bytes, keyset, keysetDigest: digest, staleAfter };
  return gatewayKey;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// The response key comes from the answer itself and our public key travels in the clear, so anyone relaying the
// answer could encrypt their own text to us. The receipt is what ties these exact bytes to the attested gateway.
async function verifyReceipt(response: Response, body: Uint8Array, sealed: SealedRequest): Promise<void> {
  try {
    const id = response.headers.get("X-Receipt-Id");
    if (!id) throw new Error("no X-Receipt-Id");
    const fetched = await apiFetch(`${API_URL}/api/phala/receipts/${encodeURIComponent(id)}`);
    if (!fetched.ok) throw new Error(`receipt HTTP ${fetched.status}`);
    const { verifyReceipt: verify, checkResponseBodyHash, findEvent } = await import("@phala/aci-verifier");
    const result = await verify((await fetched.json()) as ReceiptEnvelope, sealed.gateway.keyset, sealed.gateway.keysetDigest);
    if (!result.ok || !result.payload) throw new Error(JSON.stringify(result.checks));
    if (!(await checkResponseBodyHash(result.payload, body))) throw new Error("response bytes don't match the receipt");
    // The pin travels outside the encrypted fields, so the gateway's signed word is what shows it held.
    if (sealed.sessionIds.length > 0) {
      const served = findEvent(result.payload, "upstream.verified");
      if (served?.result !== "verified" || !sealed.sessionIds.includes(String(served.session_id))) {
        throw new Error("the answer came from a host other than the one verified here");
      }
    }
  } catch (error) {
    console.warn("[karui] Phala receipt:", error);
    throw new UnverifiedAnswerError();
  }
}

export interface PhalaTurn {
  role: string;

  content: unknown;
}

/**
 * The gateway restores a whole-content plaintext that parses as a JSON array as
 * structured content, so a user message that happens to be "[1, 2]" would turn
 * into parts. Such text goes out wrapped as a single text part instead.
 */
function contentPlaintext(content: unknown): string {
  if (typeof content !== "string") return JSON.stringify(content);
  try {
    if (Array.isArray(JSON.parse(content))) return JSON.stringify([{ type: "text", text: content }]);
  } catch {

  }
  return content;
}

interface SealedRequest {
  headers: HeadersInit;
  body: string;
  nonce: string;
  ts: number;
  secret: Uint8Array;
  gateway: GatewayKey;
  model: string;
  sessionIds: string[];
}

async function sealRequest(
  model: string,
  turns: PhalaTurn[],
  extra: Record<string, unknown>,
  phase?: "compression"
): Promise<SealedRequest> {
  const keys = getClientKeys();
  const [gateway, sessionIds] = await Promise.all([getGatewayKey(), tinfoilSessionIds(model)]);
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const ts = Math.floor(Date.now() / 1000);

  const messages = await Promise.all(
    turns.map(async (turn, m) => ({
      role: turn.role,
      content: await encryptField(contentPlaintext(turn.content), gateway.bytes, requestAad(model, `messages.${m}.content`, nonce, ts)),
    }))
  );

  return {
    headers: {
      "Content-Type": "application/json",
      "X-E2EE-Version": "2",
      "X-Client-Pub-Key": toHex(keys.publicKey),
      "X-Model-Pub-Key": gateway.hex,
      "X-E2EE-Nonce": nonce,
      "X-E2EE-Timestamp": String(ts),
      ...(phase ? { "X-Karui-Phase": phase } : {}),
    },
    // aci_verified: only an upstream the gateway attested may get the prompt;
    // without it a model can be routed to a host that sees plaintext.
    body: JSON.stringify({
      model,
      messages,
      provider: { aci_verified: true, ...(sessionIds.length > 0 ? { aci_session_ids: sessionIds } : {}) },
      ...extra,
    }),
    nonce,
    ts,
    secret: keys.secretKey,
    gateway,
    model,
    sessionIds,
  };
}

async function throwForStatus(response: Response, sealed: SealedRequest): Promise<void> {
  if (response.status === 412) forgetTinfoilSessions(sealed.model);
  if (response.ok) {
    // Turns away an answer in the clear early. Any relay can set this header, so the receipt is the proof.
    if (response.headers.get("X-E2EE-Applied") !== "true") {
      throw new Error("Phala answered without end-to-end encryption, so Karui refused the answer.");
    }
    return;
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
    code?: string;
    reset_at?: string;
  };
  const message = (typeof data.error === "string" ? data.error : data.error?.message) || `HTTP error ${response.status}`;
  throw data.code || data.reset_at ? new RateLimitError(message, data.reset_at, data.code) : new Error(message);
}

export interface PhalaStreamResult {
  text: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  // False when the user stopped the answer before its receipt could be checked.
  verified: boolean;
}

interface StreamChunk {
  id?: string;
  choices?: Array<{ index?: number; delta?: { content?: string; reasoning?: string; reasoning_content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function streamPhalaChat(
  opts: {
    providerModelID: string;
    turns: PhalaTurn[];
    reasoningParams?: Record<string, unknown>;
    signal?: AbortSignal;
    stopAt?: StopAt;
  },
  onToken: (token: string) => void
): Promise<PhalaStreamResult> {
  const model = opts.providerModelID;
  const sealed = await sealRequest(model, opts.turns, {
    stream: true,
    // Usage in every chunk lets our proxy bill a stopped answer for what was generated, not the whole hold.
    stream_options: { include_usage: true, continuous_usage_stats: true },
    ...(opts.reasoningParams ?? {}),
  });

  const response = await fetch(`${API_URL}/api/phala/v1/chat/completions`, {
    method: "POST",
    headers: sealed.headers,
    body: sealed.body,
    signal: opts.signal,
  }).catch((error: unknown) => {
    if (opts.signal?.aborted) throw new StoppedError();
    throw error;
  });
  await throwForStatus(response, sealed);
  if (!response.body) throw new Error("Empty response body");

  const reader = response.body.getReader();
  const open = async (chunk: StreamChunk, index: number, name: string, value: string): Promise<string> => {
    const field = `choices.${index}.delta.${name}`;
    const text = await decryptField(value, sealed.secret, responseAad(model, chunk.id ?? "", field, sealed.nonce, sealed.ts));
    if (text !== null) return text;
    await reader.cancel();
    throw new UnverifiedAnswerError();
  };

  const streamDecoder = new TextDecoder();
  const received: Uint8Array[] = [];
  let buffer = "";
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let inReasoning = false;
  let loopStopped = false;
  let drainUntil: number | null = null;
  let drainTimedOut = false;
  let stopped = false;
  const loopCut = createLoopGuard();

  while (!drainTimedOut) {
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await reader.read();
    } catch (error) {
      if (!opts.signal?.aborted) throw error;
      stopped = true;
      break;
    }
    if (read.done) break;
    received.push(read.value);

    buffer += streamDecoder.decode(read.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;

      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(payload) as StreamChunk;
      } catch {
        continue;
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }
      // Past a tool call or repetition cut, the rest is read only for the receipt; nothing more is shown.
      if (drainUntil !== null) {
        if (Date.now() > drainUntil) {
          drainTimedOut = true;
          await reader.cancel();
          break;
        }
        continue;
      }

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (!choice || !delta) continue;
      const index = choice.index ?? 0;

      const reasoningName = delta.reasoning_content ? "reasoning_content" : delta.reasoning ? "reasoning" : null;
      if (reasoningName) {
        const reasoning = await open(chunk, index, reasoningName, delta[reasoningName] as string);
        if (reasoning) {
          if (!inReasoning) {
            inReasoning = true;
            text += "<reasoning>";
            onToken("<reasoning>");
          }
          text += reasoning;
          onToken(reasoning);
        }
      }

      if (delta.content) {
        const content = await open(chunk, index, "content", delta.content);
        if (content) {
          if (inReasoning) {
            inReasoning = false;
            text += "</reasoning>";
            onToken("</reasoning>");
          }
          text += content;
          onToken(content);
        }
      }

      const cut = loopCut(text);
      if (cut !== -1) {
        text = text.slice(0, cut);
        loopStopped = true;
        drainUntil = Date.now() + CALL_DRAIN_LIMIT_MS;
        continue;
      }
      const call = opts.stopAt?.(text) ?? -1;
      if (call !== -1) {
        text = text.slice(0, call);
        drainUntil = Date.now() + CALL_DRAIN_LIMIT_MS;
      }
    }
  }
  if (drainTimedOut) throw new UnverifiedAnswerError();
  const verified = !stopped;
  if (verified) await verifyReceipt(response, concatBytes(received), sealed);

  if (inReasoning) {
    text += "</reasoning>";
    onToken("</reasoning>");
  }
  if (loopStopped) {
    text += REPETITION_NOTICE;
    onToken(REPETITION_NOTICE);
  }
  if (stopped) {
    if (!text.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim()) throw new StoppedError();
    text += STOPPED_NOTICE;
    onToken(STOPPED_NOTICE);
  }

  return { text, provider: "phala", inputTokens, outputTokens, verified };
}

export async function phalaCompletion(opts: {
  providerModelID: string;
  turns: PhalaTurn[];
  tools?: JsonTool[];
  reasoningParams?: Record<string, unknown>;
  /** The phase declaration for the proxy — it decides which pool this call bills to. */
  phase?: "compression";
  /** Tells our proxy not to discount the base prompt this call doesn't carry. */
  withoutBasePrompt?: boolean;
}): Promise<ToolResponse> {
  const model = opts.providerModelID;
  const tools = opts.tools ?? [];
  const sealed = await sealRequest(
    model,
    tools.length > 0 ? withToolInstructions(opts.turns, tools) : opts.turns,
    {
      ...(opts.reasoningParams ?? {}),
      ...(tools.length > 0 ? { response_format: { type: "json_object" } } : {}),
    },
    opts.phase
  );

  const response = await fetch(`${API_URL}/api/phala/v1/chat/completions`, {
    method: "POST",
    headers: opts.withoutBasePrompt ? { ...sealed.headers, "X-Karui-Base-Prompt": "none" } : sealed.headers,
    body: sealed.body,
  });
  await throwForStatus(response, sealed);
  const body = new Uint8Array(await response.arrayBuffer());
  await verifyReceipt(response, body, sealed);

  const data = JSON.parse(decoder.decode(body)) as {
    id?: string;
    choices?: Array<{ index?: number; message?: { content?: string | null } }>;
  };
  const choice = data.choices?.[0];
  const sealedContent = choice?.message?.content;
  let content = "";
  if (sealedContent) {
    const field = `choices.${choice?.index ?? 0}.message.content`;
    const opened = await decryptField(sealedContent, sealed.secret, responseAad(model, data.id ?? "", field, sealed.nonce, sealed.ts));
    if (opened === null) throw new UnverifiedAnswerError();
    content = opened;
  }

  if (tools.length === 0) return { content, toolCalls: [] };
  return parseToolResponse(content, tools);
}
