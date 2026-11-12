// Seals a request to the attested key of Karui's enclave and opens the enclave's reply, so nothing on the way, our
// own server included, reads either. HPKE (RFC 9180) in base mode with DHKEM(X25519, HKDF-SHA256), HKDF-SHA256 and
// AES-256-GCM; the reply key is exported from the same key exchange. The enclave's side is internal/channel in
// its repo, and both test the same fixed vector.

import { base64ToUint8Array, bytesToBase64 } from "@/lib/account/crypto";

const INFO = "karui-enclave-channel-v1";
const REPLY_LABEL = "karui-enclave-channel-v1 reply";

const KEM_SUITE = bytes("KEM", [0x00, 0x20]);
const HPKE_SUITE = bytes("HPKE", [0x00, 0x20, 0x00, 0x01, 0x00, 0x02]);
const KEY_SIZE = 32;
const NONCE_SIZE = 12;
const MODE_BASE = 0;

export type SealedRequest = { encapsulation: string; ciphertext: string };
export type SealedReply = { nonce: string; ciphertext: string };
export type ReplyKey = { key: CryptoKey; encapsulation: Uint8Array };

function bytes(...parts: (string | ArrayLike<number>)[]): Uint8Array {
  const chunks = parts.map((part) => (typeof part === "string" ? new TextEncoder().encode(part) : Uint8Array.from(part)));
  const out = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data as BufferSource));
}

// HKDF-Extract and HKDF-Expand with RFC 9180's labels. An empty salt is a block of zeros (RFC 5869).
function labeledExtract(suite: Uint8Array, salt: Uint8Array, label: string, material: Uint8Array): Promise<Uint8Array> {
  return hmac(salt.length ? salt : new Uint8Array(KEY_SIZE), bytes("HPKE-v1", suite, label, material));
}

async function labeledExpand(suite: Uint8Array, key: Uint8Array, label: string, info: Uint8Array, length: number): Promise<Uint8Array> {
  const labeled = bytes([length >> 8, length & 0xff], "HPKE-v1", suite, label, info);
  let block: Uint8Array = new Uint8Array(0);
  let out: Uint8Array = new Uint8Array(0);
  for (let counter = 1; out.length < length; counter++) {
    block = await hmac(key, bytes(block, labeled, [counter]));
    out = bytes(out, block);
  }
  return out.slice(0, length);
}

async function sharedSecret(ephemeral: CryptoKeyPair, encapsulation: Uint8Array, enclaveKey: Uint8Array): Promise<Uint8Array> {
  const recipient = await crypto.subtle.importKey("raw", enclaveKey as BufferSource, { name: "X25519" }, false, []);
  const exchanged = new Uint8Array(await crypto.subtle.deriveBits({ name: "X25519", public: recipient }, ephemeral.privateKey, 256));
  const extracted = await labeledExtract(KEM_SUITE, new Uint8Array(0), "eae_prk", exchanged);
  return labeledExpand(KEM_SUITE, extracted, "shared_secret", bytes(encapsulation, enclaveKey), KEY_SIZE);
}

async function aesKey(raw: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [usage]);
}

// sealWith is seal with a chosen one-time key, which only the test vector needs.
export async function sealWith(ephemeral: CryptoKeyPair, enclaveKey: Uint8Array, plaintext: Uint8Array): Promise<{ request: SealedRequest; replyKey: ReplyKey }> {
  const encapsulation = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const shared = await sharedSecret(ephemeral, encapsulation, enclaveKey);

  const none = new Uint8Array(0);
  const context = bytes(
    [MODE_BASE],
    await labeledExtract(HPKE_SUITE, none, "psk_id_hash", none),
    await labeledExtract(HPKE_SUITE, none, "info_hash", bytes(INFO)),
  );
  const secret = await labeledExtract(HPKE_SUITE, shared, "secret", none);
  const key = await labeledExpand(HPKE_SUITE, secret, "key", context, KEY_SIZE);
  // One message per key exchange, so the base nonce is the nonce.
  const nonce = await labeledExpand(HPKE_SUITE, secret, "base_nonce", context, NONCE_SIZE);
  const exporter = await labeledExpand(HPKE_SUITE, secret, "exp", context, KEY_SIZE);
  const replySecret = await labeledExpand(HPKE_SUITE, exporter, "sec", bytes(REPLY_LABEL), KEY_SIZE);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, await aesKey(key, "encrypt"), plaintext as BufferSource);
  return {
    request: { encapsulation: bytesToBase64(encapsulation), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) },
    replyKey: { key: await aesKey(replySecret, "decrypt"), encapsulation },
  };
}

export async function seal(enclaveKey: Uint8Array, plaintext: Uint8Array): Promise<{ request: SealedRequest; replyKey: ReplyKey }> {
  const ephemeral = (await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"])) as CryptoKeyPair;
  return sealWith(ephemeral, enclaveKey, plaintext);
}

// The reply is bound to its request: it opens only with that request's key and one-time public key.
export async function openReply(replyKey: ReplyKey, reply: SealedReply): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToUint8Array(reply.nonce) as BufferSource, additionalData: replyKey.encapsulation as BufferSource },
    replyKey.key,
    base64ToUint8Array(reply.ciphertext) as BufferSource,
  );
  return new Uint8Array(plaintext);
}
