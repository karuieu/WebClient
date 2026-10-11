// Keeps HTTP helpers independent of chat to avoid a circular dependency.

import { ensureAesKey } from "./session";
import { decryptField, encryptField, fieldAad } from "./crypto";
import { API_URL, JSON_HEADERS, apiFetch } from "./api";

export const CUSTOM_INSTRUCTIONS_MAX_CHARS = 2000;

async function requireAesKey(): Promise<CryptoKey> {
  const key = await ensureAesKey();
  if (!key) throw new Error("Encryption key unavailable — please sign in again.");
  return key;
}

async function apiCall<T>(endpoint: string, options: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...JSON_HEADERS, ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(
      (data as { error?: string }).error || `HTTP error ${response.status} ${response.statusText}`
    );
  }
  if (response.status === 204) return null as unknown as T;
  return response.json();
}

export interface UserCustomInstructions {
  content: string;
  updatedAt: string | null;
  exists: boolean;
}

interface RawCustomInstructions {
  encrypted_content: string;
  updated_at: string | null;
  exists: boolean;
}

interface RawSavedCustomInstructions {
  encrypted_content: string;
  updated_at: string;
}

export async function getCustomInstructionsDoc(): Promise<UserCustomInstructions> {
  const key = await requireAesKey();
  const raw = await apiCall<RawCustomInstructions>("/api/custom-instructions", { method: "GET" });
  if (!raw.exists || !raw.encrypted_content) {
    return { content: "", updatedAt: raw.updated_at, exists: raw.exists };
  }
  let content = "";
  try {
    content = await decryptField(key, raw.encrypted_content, fieldAad("custom-instructions"));
  } catch {
    content = "";
  }
  return { content, updatedAt: raw.updated_at, exists: true };
}

export async function saveCustomInstructions(content: string): Promise<UserCustomInstructions> {
  const key = await requireAesKey();
  const trimmed = content.trim().slice(0, CUSTOM_INSTRUCTIONS_MAX_CHARS);
  const encrypted_content = trimmed ? await encryptField(key, trimmed, fieldAad("custom-instructions")) : "";
  const raw = await apiCall<RawSavedCustomInstructions>("/api/custom-instructions", {
    method: "PUT",
    body: JSON.stringify({ encrypted_content }),
  });
  return { content: trimmed, updatedAt: raw.updated_at, exists: true };
}

export async function getCustomInstructionsContext(): Promise<string> {
  try {
    const doc = await getCustomInstructionsDoc();
    return doc.content.trim();
  } catch {
    return "";
  }
}
