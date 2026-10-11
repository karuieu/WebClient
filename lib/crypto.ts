// Changing a password must re-wrap the same AES key with the new password. A plain PATCH that replaces only password_hash leaves the key under a password nobody knows, destroying the account's data. The session key itself stays non-extractable.

const PBKDF2_SALT_SIZE = 32;
const GCM_NONCE_SIZE = 12;
const USER_AES_KEY_SIZE = 32;
const PBKDF2_ITERATIONS = 600000;
const USER_KEY_ENVELOPE_VERSION = 1;

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  usages: KeyUsage[] = ["decrypt"]
): Promise<CryptoKey> {

  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    passwordData,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    usages
  );

  return derivedKey;
}

/**
 * Converts a Uint8Array to base64, safely for large inputs — in chunks, to avoid
 * blowing the stack in String.fromCharCode.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Sent instead of the password. The server stores only Argon2 of it, so it never sees the password that unwraps the AES key. The email is normalised (trim + lowercase) exactly like the backend does.
export async function deriveAuthKey(email: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = await window.crypto.subtle.digest("SHA-256", encoder.encode(`karui/auth/v1:${email.trim().toLowerCase()}`));
  const passwordKey = await window.crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    passwordKey,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function decryptAESKey(
  password: string,
  encryptedAESKeyBase64: string
): Promise<CryptoKey> {
  // The raw bytes exist only briefly here; the resulting key can't be exported.
  return importRawKeyNonExtractable(await unwrapRawAESKey(password, encryptedAESKeyBase64));
}

// Returns the raw AES key bytes, only for re-wrapping the same key. Hold them as briefly as possible and never store them.
export async function unwrapRawAESKey(password: string, encryptedAESKeyBase64: string): Promise<Uint8Array> {
  const encryptedData = base64ToUint8Array(encryptedAESKeyBase64);

  const minSize = 1 + PBKDF2_SALT_SIZE + GCM_NONCE_SIZE + 16 + USER_AES_KEY_SIZE;
  if (encryptedData.length < minSize) {
    throw new Error(`Encrypted data too short: ${encryptedData.length} < ${minSize}`);
  }
  const version = encryptedData[0];
  if (version !== USER_KEY_ENVELOPE_VERSION) {
    throw new Error(`Unsupported key envelope version: ${version} (expected ${USER_KEY_ENVELOPE_VERSION})`);
  }
  const salt = encryptedData.slice(1, 1 + PBKDF2_SALT_SIZE);
  const nonce = encryptedData.slice(1 + PBKDF2_SALT_SIZE, 1 + PBKDF2_SALT_SIZE + GCM_NONCE_SIZE);
  const ciphertext = encryptedData.slice(1 + PBKDF2_SALT_SIZE + GCM_NONCE_SIZE);

  const wrappingKey = await deriveKeyFromPassword(password, salt);
  try {
    return new Uint8Array(await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, wrappingKey, ciphertext));
  } catch (error) {
    throw new Error(`Could not decrypt the AES key: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export async function wrapRawAESKey(rawKey: Uint8Array, password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_SIZE));
  const nonce = window.crypto.getRandomValues(new Uint8Array(GCM_NONCE_SIZE));
  const wrappingKey = await deriveKeyFromPassword(password, salt, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as unknown as BufferSource },
      wrappingKey,
      rawKey as unknown as BufferSource
    )
  );
  const envelope = new Uint8Array(1 + salt.length + nonce.length + ciphertext.length);
  envelope[0] = USER_KEY_ENVELOPE_VERSION;
  envelope.set(salt, 1);
  envelope.set(nonce, 1 + salt.length);
  envelope.set(ciphertext, 1 + salt.length + nonce.length);
  return bytesToBase64(envelope);
}

export function importAESKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return importRawKeyNonExtractable(rawKey);
}

// The envelope formats must match the backend's crypto.go, so either side can decrypt what the other wrote.

export async function generateEncryptedAESKey(
  password: string
): Promise<{ encryptedAESKey: string; key: CryptoKey }> {
  const rawKey = window.crypto.getRandomValues(new Uint8Array(USER_AES_KEY_SIZE));
  try {
    const encryptedAESKey = await wrapRawAESKey(rawKey, password);
    return { encryptedAESKey, key: await importRawKeyNonExtractable(rawKey) };
  } finally {
    rawKey.fill(0);
  }
}

async function importRawKeyNonExtractable(raw: Uint8Array): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    "raw",
    raw as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export type FieldKind =
  | "message"
  | "chat-title"
  | "chat-summary"
  | "chat-brief"
  | "project-name"
  // Legacy label: 'project-description' is still accepted so older goals keep opening.
  | "project-description"
  | "project-settings"
  | "project-memory-name"
  | "project-memory-description"
  | "project-memory-content"
  | "project-file-path"
  | "project-file-preview"
  | "project-file-content"
  | "memory-category"
  | "memory-file-name"
  | "memory-file-description"
  | "memory-file-content"
  | "custom-instructions"
  | "skill-name"
  | "skill-description"
  | "skill-content";

export function fieldAad(kind: FieldKind, ...ids: string[]): string {
  return ["karui/v2", kind, ...ids].join("|");
}

/** A message is bound to its chat, its own id and its role: a flipped role or a copy elsewhere doesn't open. */
export function messageAad(chatId: string, messageId: string, role: string): string {
  return fieldAad("message", chatId, messageId, role);
}

// Binds the ciphertext to its place (aad), so a server-side move, role flip or copy fails to decrypt. Data written before the binding existed no longer opens.
export async function encryptField(key: CryptoKey, plaintext: string, aad: string): Promise<string> {
  return seal(key, plaintext, aad);
}

export async function decryptField(key: CryptoKey, encryptedBase64: string, aad: string): Promise<string> {
  return unseal(key, encryptedBase64, aad);
}

// Unbound encryption, only for data that never leaves this browser. Anything the server keeps goes through encryptField.
export async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  return seal(key, plaintext);
}

async function seal(key: CryptoKey, plaintext: string, aad?: string): Promise<string> {
  const nonce = window.crypto.getRandomValues(new Uint8Array(GCM_NONCE_SIZE));
  const data = new TextEncoder().encode(plaintext);

  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce as unknown as BufferSource,
        ...(aad !== undefined ? { additionalData: new TextEncoder().encode(aad) as unknown as BufferSource } : {}),
      },
      key,
      data as unknown as BufferSource
    )
  );

  const envelope = new Uint8Array(nonce.length + ciphertext.length);
  envelope.set(nonce, 0);
  envelope.set(ciphertext, nonce.length);
  return bytesToBase64(envelope);
}

export async function decryptMessage(key: CryptoKey, encryptedBase64: string): Promise<string> {
  return unseal(key, encryptedBase64);
}

async function unseal(key: CryptoKey, encryptedBase64: string, aad?: string): Promise<string> {
  const raw = base64ToUint8Array(encryptedBase64);
  if (raw.length <= GCM_NONCE_SIZE) {
    throw new Error("Invalid message ciphertext");
  }
  const nonce = raw.slice(0, GCM_NONCE_SIZE);
  const ciphertext = raw.slice(GCM_NONCE_SIZE);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce as unknown as BufferSource,
      ...(aad !== undefined ? { additionalData: new TextEncoder().encode(aad) as unknown as BufferSource } : {}),
    },
    key,
    ciphertext as unknown as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}
