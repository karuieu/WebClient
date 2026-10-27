// Recovery phrase: 12 BIP39 words (128 random bits plus a checksum). Two keys are derived with HKDF: one wraps the AES key, the other is sent at reset so the server can check the phrase. The words never leave the browser. No PBKDF2: the input is already random.

import { base64ToUint8Array, bytesToBase64 } from "./crypto";
import { RECOVERY_WORDS } from "./recoveryWords";

export const PHRASE_WORDS = 12;
const ENTROPY_BYTES = 16;
const ENVELOPE_VERSION = 1;
const NONCE_SIZE = 12;
const encoder = new TextEncoder();
const HKDF_SALT = encoder.encode("karui/recovery/v1");

export const PHRASE_FILE_HEADING = "Karui recovery phrase";

export class RecoveryPhraseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryPhraseError";
  }
}

export type RecoveryKit = {
  words: string[];
  envelope: string;
  recoveryKey: string;
};

let wordIndex: Map<string, number> | null = null;

async function checksumBits(entropy: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await window.crypto.subtle.digest("SHA-256", entropy as unknown as BufferSource));
  return hash[0].toString(2).padStart(8, "0").slice(0, (ENTROPY_BYTES * 8) / 32);
}

function bitsOf(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(2).padStart(8, "0")).join("");
}

export async function parseRecoveryPhrase(input: string): Promise<Uint8Array> {
  let words = input.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const heading = PHRASE_FILE_HEADING.toLowerCase().split(" ");
  if (words.length > PHRASE_WORDS && heading.every((w, i) => words[i] === w)) words = words.slice(heading.length);

  if (words.length !== PHRASE_WORDS) {
    throw new RecoveryPhraseError(`Enter all ${PHRASE_WORDS} words, there ${words.length === 1 ? "is" : "are"} ${words.length} now.`);
  }
  wordIndex ??= new Map(RECOVERY_WORDS.map((w, i) => [w, i]));
  let bits = "";
  for (const w of words) {
    const i = wordIndex.get(w);
    if (i === undefined) throw new RecoveryPhraseError(`"${w}" isn't one of the recovery words, check its spelling.`);
    bits += i.toString(2).padStart(11, "0");
  }
  const entropy = new Uint8Array(ENTROPY_BYTES);
  for (let i = 0; i < ENTROPY_BYTES; i++) entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  if (bits.slice(ENTROPY_BYTES * 8) !== (await checksumBits(entropy))) {
    throw new RecoveryPhraseError("Those words don't form a recovery phrase, check their order.");
  }
  return entropy;
}

async function phraseKeys(entropy: Uint8Array): Promise<{ wrapKey: CryptoKey; recoveryKey: string }> {
  const base = await window.crypto.subtle.importKey("raw", entropy as unknown as BufferSource, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
  const params = (info: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(info) });
  const wrapKey = await window.crypto.subtle.deriveKey(params("wrap"), base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const verify = await window.crypto.subtle.deriveBits(params("verify"), base, 256);
  return { wrapKey, recoveryKey: bytesToBase64(new Uint8Array(verify)) };
}

export async function createRecoveryKit(rawKey: Uint8Array): Promise<RecoveryKit> {
  const entropy = window.crypto.getRandomValues(new Uint8Array(ENTROPY_BYTES));
  const bits = bitsOf(entropy) + (await checksumBits(entropy));
  const words = Array.from({ length: PHRASE_WORDS }, (_, i) => RECOVERY_WORDS[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);

  const { wrapKey, recoveryKey } = await phraseKeys(entropy);
  const nonce = window.crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, wrapKey, rawKey as unknown as BufferSource)
  );
  const envelope = new Uint8Array(1 + NONCE_SIZE + ciphertext.length);
  envelope[0] = ENVELOPE_VERSION;
  envelope.set(nonce, 1);
  envelope.set(ciphertext, 1 + NONCE_SIZE);
  return { words, envelope: bytesToBase64(envelope), recoveryKey };
}

export async function openWithPhrase(input: string, envelopeB64: string): Promise<{ rawKey: Uint8Array; recoveryKey: string }> {
  const entropy = await parseRecoveryPhrase(input);
  const envelope = base64ToUint8Array(envelopeB64);
  if (envelope[0] !== ENVELOPE_VERSION || envelope.length <= 1 + NONCE_SIZE) {
    throw new Error(`Unsupported recovery envelope version: ${envelope[0]}`);
  }
  const { wrapKey, recoveryKey } = await phraseKeys(entropy);
  try {
    const raw = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.slice(1, 1 + NONCE_SIZE) },
      wrapKey,
      envelope.slice(1 + NONCE_SIZE)
    );
    return { rawKey: new Uint8Array(raw), recoveryKey };
  } catch {

    throw new RecoveryPhraseError("That phrase doesn't match, check the words and their order.");
  }
}
