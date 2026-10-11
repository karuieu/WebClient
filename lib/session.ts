// Session state. The JWT is an HttpOnly cookie the backend sets on the API host, so script can't read it (lib/api.ts sends it). User details live in localStorage, and the AES key in IndexedDB as a non-extractable CryptoKey, with an in-memory cache. The raw key cannot be exported, so XSS can use the key but cannot steal it.

import { API_URL, apiFetch } from "./api";

export interface User {
  id: string;
  email: string;
  display_name: string;
  full_name: string;
  tier: string;
  cancel_at_period_end: boolean;
  onboarding_completed: boolean;
}

export interface Session {
  user: User;
  aesKey: CryptoKey;
}

// Holds no secret: it only tells the Next middleware to let a signed-in visitor through. Lax, so it comes along when
// the user returns from Polar or an email link.
const SIGNED_IN_COOKIE = "karui_signed_in";
// The script-readable token cookie from before the HttpOnly session; removed wherever it is still found.
const LEGACY_TOKEN_COOKIE = "karui_token";
const USER_KEY = "karui_user";

const DB_NAME = "karui";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const KEY_ID = "user_aes_key";
const PENDING_RECOVERY_ID = "pending_recovery";
// Long enough for onboarding, short enough that an abandoned one doesn't keep it.
const PENDING_RECOVERY_TTL_MS = 60 * 60 * 1000;

// An in-memory key cache — it lets the chat and project helpers read the key
// synchronously after a single load from IndexedDB at session start.
let cachedKey: CryptoKey | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function hasIndexedDB(): boolean {
  return isBrowser() && typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(KEY_STORE)) {
        req.result.createObjectStore(KEY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(id: string, value: unknown): Promise<void> {
  if (!hasIndexedDB()) return;
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGet<T>(id: string): Promise<T | null> {
  if (!hasIndexedDB()) return null;
  const db = await openDB();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readonly");
      const r = tx.objectStore(KEY_STORE).get(id);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  if (!hasIndexedDB()) return;
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function isSignedIn(): boolean {
  if (!isBrowser()) return false;
  return document.cookie.split(";").some((cookie) => cookie.trim().startsWith(`${SIGNED_IN_COOKIE}=`));
}

// Matches the JWT TTL, or the middleware lets the user in while every API call answers 401.
const COOKIE_MAX_AGE_DEFAULT = 60 * 60 * 24;
const COOKIE_MAX_AGE_REMEMBER = 60 * 60 * 24 * 30;

function writeCookie(name: string, value: string, maxAge: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; path=/; SameSite=Lax; max-age=${maxAge}${secure}`;
}

export async function setSession(userData: User, aesKey: CryptoKey, rememberMe: boolean): Promise<void> {
  if (!isBrowser()) return;
  writeCookie(SIGNED_IN_COOKIE, "1", rememberMe ? COOKIE_MAX_AGE_REMEMBER : COOKIE_MAX_AGE_DEFAULT);
  writeCookie(LEGACY_TOKEN_COOKIE, "", 0);
  localStorage.setItem(USER_KEY, JSON.stringify(userData));
  cachedKey = aesKey;
  await idbPut(KEY_ID, aesKey);
}

export async function restoreKey(): Promise<boolean> {
  if (cachedKey) return true;
  cachedKey = await idbGet<CryptoKey>(KEY_ID);
  return !!cachedKey;
}

export function getAesKey(): CryptoKey | null {
  return cachedKey;
}

// Reads the AES key from IndexedDB when the cache is empty. Use this, not the cache alone, when a session must have the key: the cache can be empty after a Fast Refresh.
export async function ensureAesKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  await restoreKey();
  return cachedKey;
}

export async function requireAesKey(): Promise<CryptoKey> {
  const key = await ensureAesKey();
  if (!key) throw new Error("Encryption key unavailable — please sign in again.");
  return key;
}

export function getSession(): Session | null {
  if (!isBrowser()) return null;

  if (!isSignedIn()) return null;

  if (!cachedKey) return null;

  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;

  let user: User;
  try {
    user = JSON.parse(userStr);
  } catch {
    return null;
  }

  return { user, aesKey: cachedKey };
}

// Per-account settings key. The old shared key is migrated to the first account that reads it, so settings do not leak to the next account.
export function accountSettingKey(base: string): string {
  const id = getUser()?.id;
  if (!id) return base;
  const key = `${base}:${id}`;
  try {
    const shared = localStorage.getItem(base);
    if (shared !== null) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, shared);
      localStorage.removeItem(base);
    }
  } catch {
  }
  return key;
}

export function getUser(): User | null {
  if (!isBrowser()) return null;
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// Registry of in-memory caches tied to one session (NEAR client, Phala keys, model catalogue, system prompt). They are cleared on sign-out so the next account never reuses them. Kept here rather than imported by those modules, to avoid a dependency cycle.
type SessionResetHandler = () => void;
const sessionResetHandlers = new Set<SessionResetHandler>();

export function onSessionCleared(handler: SessionResetHandler): () => void {
  sessionResetHandlers.add(handler);
  return () => sessionResetHandlers.delete(handler);
}

// Script can't delete the HttpOnly session cookie, so the backend expires it. Signing out doesn't wait long for that.
const LOGOUT_TIMEOUT_MS = 5_000;

export async function clearSession(): Promise<void> {
  if (!isBrowser()) return;
  await apiFetch(`${API_URL}/api/auth/logout`, { method: "POST", signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS) }).catch(() => {});
  writeCookie(SIGNED_IN_COOKIE, "", 0);
  writeCookie(LEGACY_TOKEN_COOKIE, "", 0);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("karui_tinfoil_cache_secret");
  cachedKey = null;
  // Clearing the caches must NOT interrupt signing out — the token and the AES
  // key have to disappear even if one of the handlers throws.
  for (const handler of sessionResetHandlers) {
    try {
      handler();
    } catch (error) {
      console.warn("[karui] error clearing a cache during sign-out:", error);
    }
  }
  await Promise.all([idbDelete(KEY_ID), idbDelete(PENDING_RECOVERY_ID)]);
}

// The recovery phrase made at first sign-in stays sealed with the session key until onboarding shows it. It expires after an hour, on sign-out, or once saved.

type PendingRecoveryRecord = { sealed: string; createdAt: number };

export async function putPendingRecovery(sealed: string): Promise<void> {
  await idbPut(PENDING_RECOVERY_ID, { sealed, createdAt: Date.now() } satisfies PendingRecoveryRecord);
}

export async function getPendingRecovery(): Promise<string | null> {
  const record = await idbGet<PendingRecoveryRecord>(PENDING_RECOVERY_ID).catch(() => null);
  if (!record) return null;
  if (Date.now() - record.createdAt > PENDING_RECOVERY_TTL_MS) {
    await deletePendingRecovery();
    return null;
  }
  return record.sealed;
}

export async function deletePendingRecovery(): Promise<void> {
  await idbDelete(PENDING_RECOVERY_ID).catch(() => {});
}

export function isLoggedIn(): boolean {
  return getSession() !== null;
}

export function updateUser(userData: User): void {
  if (!isBrowser()) return;
  localStorage.setItem(USER_KEY, JSON.stringify(userData));
}

// Onboarding state lives on the server (users.onboarding_completed), not in localStorage, so it survives a device change.
export function isOnboardingPending(user: User | null): boolean {
  return !!user && !user.onboarding_completed;
}
