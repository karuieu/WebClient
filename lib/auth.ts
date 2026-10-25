/**
 * Derive auth keys and unwrap AES keys in the browser; the raw password never leaves it.
 * Registration creates the account on email confirmation; two-factor login returns the envelope only after
 * its second step.
 */

import {
  decryptMessage,
  deriveAuthKey,
  encryptMessage,
  generateEncryptedAESKey,
  importAESKey,
  unwrapRawAESKey,
  wrapRawAESKey,
} from "./crypto";
import { createRecoveryKit, openWithPhrase, type RecoveryKit } from "./recovery";
import {
  setSession,
  getUser,
  clearSession,
  deletePendingRecovery,
  ensureAesKey,
  getPendingRecovery,
  isOnboardingPending,
  isSignedIn,
  putPendingRecovery,
  type User,
} from "./session";
import { API_URL, apiFetch } from "./api";
import { takeCaptchaToken } from "./captcha";

/** Match backend MaxNameChars so saved names stay within the API's rune limit. */
export const NAME_MAX_CHARS = 32;

export const GREETING_NAME_MAX_CHARS = 16;

export function truncateName(name: string, maxChars: number): string {
  const trimmed = name.trim();
  if ([...trimmed].length <= maxChars) return trimmed;
  return [...trimmed].slice(0, maxChars).join("").trimEnd() + "…";
}

interface ApiError {
  error: string;
}

/** Preserve HTTP status so callers distinguish confirmed token rejection from an unreachable backend. */
export class ApiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

interface AuthResponse {
  encrypted_aes_key?: string;
  two_factor_required?: boolean;
  challenge?: string;
}

export type LoginResult = {
  success: boolean;
  error?: string;
  twoFactorChallenge?: string;
  challengeExpired?: boolean;
};

interface RegisterApiResponse {
  email: string;
}

interface MeResponse {
  id: string;
  email: string;
  display_name: string;
  full_name: string;
  tier: string;
  cancel_at_period_end: boolean;
  onboarding_completed: boolean;
}

async function apiCall<T>(
  endpoint: string,
  options: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  try {
    const response = await apiFetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        error: `HTTP error ${response.status} ${response.statusText}`,
      }));
      throw new ApiHttpError(errorData.error || `HTTP error ${response.status}`, response.status);
    }

    if (response.status === 204) {
      return null as unknown as T;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error while calling the API");
  }
}

export async function register(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; email?: string }> {
  try {
    // Wrap the generated AES key in the browser; send only its sealed envelope.
    const [{ encryptedAESKey }, authKey, captchaToken] = await Promise.all([
      generateEncryptedAESKey(password),
      deriveAuthKey(email, password),
      takeCaptchaToken(),
    ]);

    // Registration stores a pending request; email verification creates the account.
    const data: RegisterApiResponse = await apiCall<RegisterApiResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        auth_key: authKey,
        encrypted_aes_key: encryptedAESKey,
        captcha_token: captchaToken,
      }),
    });

    return { success: true, email: data.email };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Registration failed",
    };
  }
}

export async function verifyEmail(
  token: string
): Promise<{ success: boolean; error?: string; email?: string }> {
  try {
    const data: { email: string } = await apiCall("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });

    return { success: true, email: data.email };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not confirm your email address",
    };
  }
}

/** The emailed token authenticates public account deletion across devices without a session. */
export async function confirmAccountDeletion(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiCall<void>("/api/auth/confirm-account-deletion", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "This link is invalid or has expired.",
    };
  }
}

export async function resendVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiCall("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email, captcha_token: await takeCaptchaToken() }),
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not resend the email",
    };
  }
}

export async function login(
  email: string,
  password: string,
  rememberMe: boolean = true
): Promise<LoginResult> {
  try {
    const authKey = await deriveAuthKey(email, password);
    const data = await apiCall<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        auth_key: authKey,
        remember_me: rememberMe,
        captcha_token: await takeCaptchaToken(),
      }),
    });

    if (data.two_factor_required && data.challenge) {
      return { success: false, twoFactorChallenge: data.challenge };
    }
    return await completeLogin(data, password, rememberMe, authKey);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Sign-in failed",
    };
  }
}

async function currentAuthKey(password: string): Promise<string> {
  const email = getUser()?.email;
  if (!email) throw new Error("Not authenticated");
  return deriveAuthKey(email, password);
}

/** Where a second-factor code comes from. Six digits could be "app" or "email", so it's always sent. */
export type TwoFactorMethod = "app" | "backup" | "email";

export function maskEmail(email: string): string {
  const [name, domain] = email.trim().split("@");
  if (!name || !domain) return email;
  return `${name[0]}•••@${domain}`;
}

/** Email recovery also disables two-factor; the password is used locally to unwrap AES, never sent in this step. */
export async function loginWithCode(
  challenge: string,
  code: string,
  password: string,
  rememberMe: boolean,
  method: TwoFactorMethod
): Promise<LoginResult> {
  try {
    const data = await apiCall<AuthResponse>("/api/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({ challenge, code, method }),
    });
    return await completeLogin(data, password, rememberMe);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Sign-in failed",
      challengeExpired: error instanceof ApiHttpError && error.status === 410,
    };
  }
}

export async function sendLoginEmailCode(challenge: string): Promise<{ success: boolean; error?: string; challengeExpired?: boolean }> {
  try {
    await apiCall<void>("/api/auth/login/2fa/email", { method: "POST", body: JSON.stringify({ challenge }) });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Couldn't send the code",
      challengeExpired: error instanceof ApiHttpError && error.status === 410,
    };
  }
}

async function completeLogin(data: AuthResponse, password: string, rememberMe: boolean, authKey?: string): Promise<LoginResult> {
  if (!data.encrypted_aes_key) {
    return { success: false, error: "Unexpected response from the server" };
  }
  // Keep the session key non-extractable and raw key bytes limited to this call.
  const rawKey = await unwrapRawAESKey(password, data.encrypted_aes_key);
  try {
    const aesKey = await importAESKey(rawKey);
    const userData = await getMeData();
    await setSession(userData, aesKey, rememberMe);
    if (isOnboardingPending(userData)) {
      await prepareOnboardingRecovery(rawKey, aesKey, authKey ?? (await deriveAuthKey(userData.email, password))).catch(
        () => {}
      );
    }
  } finally {
    rawKey.fill(0);
  }
  return { success: true };
}

export type RecoveryStatus = { enabled: boolean; created_at?: string };

type PendingRecovery = RecoveryKit & { authKey: string };

/**
 * Makes the phrase onboarding will show, while the raw key is at hand (only at
 * sign-in). Kept sealed with the session key until the user confirms (session.ts).
 */
async function prepareOnboardingRecovery(rawKey: Uint8Array, aesKey: CryptoKey, authKey: string): Promise<void> {
  const status = await apiCall<RecoveryStatus>("/api/auth/recovery", { method: "GET" });
  if (status.enabled) return;
  const pending: PendingRecovery = { ...(await createRecoveryKit(rawKey)), authKey };
  await putPendingRecovery(await encryptMessage(aesKey, JSON.stringify(pending)));
}

async function readPendingRecovery(): Promise<PendingRecovery | null> {
  const [sealed, key] = await Promise.all([getPendingRecovery(), ensureAesKey()]);
  if (!sealed || !key) return null;
  try {
    return JSON.parse(await decryptMessage(key, sealed)) as PendingRecovery;
  } catch {
    await deletePendingRecovery();
    return null;
  }
}

export async function loadOnboardingRecovery(): Promise<string[] | null> {
  return (await readPendingRecovery())?.words ?? null;
}

/**
 * "I've saved it" in onboarding: the phrase becomes the account's. It never
 * replaces one saved meanwhile in another tab, since the words on screen would
 * then be useless. `gone` means the step can't be finished here any more.
 */
export async function saveOnboardingRecovery(): Promise<{ error?: string; gone?: boolean }> {
  const pending = await readPendingRecovery();
  if (!pending) return { error: "This phrase expired. You can make a new one in Settings.", gone: true };
  try {
    await apiCall<void>("/api/auth/recovery", {
      method: "POST",
      body: JSON.stringify({ auth_key: pending.authKey, envelope: pending.envelope, recovery_key: pending.recoveryKey, replace: false }),
    });
  } catch (error) {
    const gone = error instanceof ApiHttpError && error.status === 409;
    if (gone) await deletePendingRecovery();
    return { error: error instanceof Error ? error.message : "Couldn't save the phrase", gone };
  }
  await deletePendingRecovery();
  return {};
}

export async function getRecoveryStatus(): Promise<RecoveryStatus> {
  return apiCall<RecoveryStatus>("/api/auth/recovery", { method: "GET" });
}

export async function createRecoveryPhrase(password: string, replace: boolean): Promise<string[]> {
  const authKey = await currentAuthKey(password);
  const { encrypted_aes_key } = await apiCall<{ encrypted_aes_key: string }>("/api/auth/key-envelope", {
    method: "POST",
    body: JSON.stringify({ auth_key: authKey }),
  });
  const rawKey = await unwrapRawAESKey(password, encrypted_aes_key);
  let kit: RecoveryKit;
  try {
    kit = await createRecoveryKit(rawKey);
  } finally {
    rawKey.fill(0);
  }
  await apiCall<void>("/api/auth/recovery", {
    method: "POST",
    body: JSON.stringify({ auth_key: authKey, envelope: kit.envelope, recovery_key: kit.recoveryKey, replace }),
  });
  return kit.words;
}

// The AES key is re-wrapped, not regenerated, so chats and the recovery phrase survive a password change.
export async function changePassword(
  current: string,
  next: string,
  code?: { code: string; method: "app" | "backup" }
): Promise<{ error?: string; field?: "current" | "code" }> {
  const email = getUser()?.email;
  if (!email) return { error: "Not authenticated" };
  const [authKey, newAuthKey] = await Promise.all([deriveAuthKey(email, current), deriveAuthKey(email, next)]);

  let envelope: string;
  try {
    ({ encrypted_aes_key: envelope } = await apiCall<{ encrypted_aes_key: string }>("/api/auth/key-envelope", {
      method: "POST",
      body: JSON.stringify({ auth_key: authKey }),
    }));
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 401) return { error: "That password isn't right.", field: "current" };
    return { error: error instanceof Error ? error.message : "Couldn't change the password" };
  }

  const rawKey = await unwrapRawAESKey(current, envelope);
  let encryptedAESKey: string;
  try {
    encryptedAESKey = await wrapRawAESKey(rawKey, next);
  } finally {
    rawKey.fill(0);
  }

  try {
    await apiCall<void>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ auth_key: authKey, new_auth_key: newAuthKey, encrypted_aes_key: encryptedAESKey, ...code }),
    });
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't change the password";
    // The password passed a moment ago, so a 401 or 429 here is about the code.
    const aboutCode = error instanceof ApiHttpError && (error.status === 401 || error.status === 429) && !!code;
    return { error: message, field: aboutCode ? "code" : undefined };
  }
}

/** Emails a reset link. The answer is the same whether or not the address has an account. */
export async function forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiCall<void>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, captcha_token: await takeCaptchaToken() }),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Couldn't send the link" };
  }
}

export type PasswordResetStart = { email: string; recovery_envelope?: string };

export async function startPasswordReset(token: string): Promise<PasswordResetStart> {
  return apiCall<PasswordResetStart>("/api/auth/reset-password/start", { method: "POST", body: JSON.stringify({ token }) });
}

// With the recovery phrase the AES key is re-wrapped, so chats survive. A fresh start makes a new key, and the server deletes data encrypted under the old one.
export async function completePasswordReset(
  token: string,
  start: PasswordResetStart,
  mode: "phrase" | "fresh",
  phrase: string,
  password: string
): Promise<void> {
  const authKeyPromise = deriveAuthKey(start.email, password);
  let encryptedAESKey: string;
  let recoveryKey: string | undefined;
  if (mode === "phrase") {
    if (!start.recovery_envelope) throw new Error("This account has no recovery phrase.");
    const opened = await openWithPhrase(phrase, start.recovery_envelope);
    try {
      encryptedAESKey = await wrapRawAESKey(opened.rawKey, password);
    } finally {
      opened.rawKey.fill(0);
    }
    recoveryKey = opened.recoveryKey;
  } else {
    ({ encryptedAESKey } = await generateEncryptedAESKey(password));
  }
  await apiCall<void>("/api/auth/reset-password/complete", {
    method: "POST",
    body: JSON.stringify({
      token,
      mode,
      auth_key: await authKeyPromise,
      encrypted_aes_key: encryptedAESKey,
      recovery_key: recoveryKey,
    }),
  });
  if (isSignedIn()) await clearSession();
}

export type TwoFactorStatus = {
  available: boolean;
  enabled: boolean;
  enabled_at?: string;
  backup_codes_left: number;
};

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return apiCall<TwoFactorStatus>("/api/auth/2fa", { method: "GET" });
}

export async function setupTwoFactor(password: string): Promise<{ secret: string; uri: string }> {
  const authKey = await currentAuthKey(password);
  return apiCall("/api/auth/2fa/setup", { method: "POST", body: JSON.stringify({ auth_key: authKey }) });
}

export async function enableTwoFactor(code: string): Promise<string[]> {
  const data = await apiCall<{ backup_codes: string[] }>("/api/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return data.backup_codes;
}

export async function sendTwoFactorEmailCode(): Promise<void> {
  await apiCall<void>("/api/auth/2fa/email", { method: "POST" });
}

export async function disableTwoFactor(code: string, method: TwoFactorMethod): Promise<void> {
  await apiCall<void>("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ code, method }),
  });
}

export async function regenerateBackupCodes(code: string, method: TwoFactorMethod): Promise<string[]> {
  const data = await apiCall<{ backup_codes: string[] }>("/api/auth/2fa/backup-codes", {
    method: "POST",
    body: JSON.stringify({ code, method }),
  });
  return data.backup_codes;
}

// Settings → Security → Ask before deleting. The server enforces it; lib/api.ts asks the user when it says so.
export type DeleteAction = "chats" | "projects" | "memory" | "skills" | "library";
export type DeleteCheck = "none" | "password" | "two_factor";
export type DeleteChecks = Record<DeleteAction, DeleteCheck>;

export async function getDeleteChecks(): Promise<DeleteChecks> {
  return apiCall<DeleteChecks>("/api/auth/delete-checks", { method: "GET" });
}

export async function setDeleteChecks(checks: DeleteChecks): Promise<void> {
  await apiCall<void>("/api/auth/delete-checks", { method: "PUT", body: JSON.stringify(checks) });
}

/** Confirms with the password (sent as its auth key) or a two-factor code; the server then lets deletions through for 5 minutes. */
export async function confirmIdentity(check: "password" | "two_factor", secret: string, method: "app" | "backup"): Promise<{ error?: string }> {
  const email = getUser()?.email;
  if (!email) return { error: "Not authenticated" };
  const body =
    check === "password" ? { check, auth_key: await deriveAuthKey(email, secret) } : { check, code: secret.trim(), method };
  try {
    await apiCall<void>("/api/auth/confirm", { method: "POST", body: JSON.stringify(body) });
    return {};
  } catch (error) {
    if (check === "password" && error instanceof ApiHttpError && error.status === 401) return { error: "That password isn't right." };
    return { error: error instanceof Error ? error.message : "Couldn't confirm it's you" };
  }
}

async function getMeData(): Promise<User> {
  const data: MeResponse = await apiCall<MeResponse>("/api/auth/me", { method: "GET" });

  return {
    id: data.id,
    email: data.email,
    display_name: data.display_name,
    full_name: data.full_name,
    tier: data.tier,
    cancel_at_period_end: data.cancel_at_period_end,
    onboarding_completed: data.onboarding_completed,
  };
}

export async function getMe(): Promise<User | null> {
  try {
    return await getMeData();
  } catch {
    return null;
  }
}

// Three states: 'rejected' (the backend answered 401) is the only case that may sign the user out. 'unreachable' means nothing is known about the token, so cached data is kept.
export type SessionCheck =
  | { status: "ok"; user: User }
  | { status: "rejected" }
  | { status: "paused" }
  | { status: "unreachable" };

export type AuthControls = { registration_enabled: boolean; login_enabled: boolean };

export function getAuthControls(): Promise<AuthControls> {
  return apiCall<AuthControls>("/api/auth/controls", { method: "GET" });
}

// getMe() maps every error to null, so it cannot tell a rejected token from a network failure. This verifies a stored session without signing out during outages.
export async function checkSession(): Promise<SessionCheck> {
  if (!isSignedIn()) return { status: "rejected" };

  try {
    return { status: "ok", user: await getMeData() };
  } catch (error) {
    if (error instanceof ApiHttpError) {
      if (error.status === 401) return { status: "rejected" };
      if (error.status === 503) return { status: "paused" };
      return { status: "unreachable" };
    }
    return { status: "unreachable" };
  }
}

export function logout(): void {

  clearSession().finally(() => {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  });
}

export async function updateProfile(displayName: string, fullName: string): Promise<User> {
  // We truncate by runes rather than .length — a surrogate pair (an emoji, say)
  // counts as 2 in JS while the backend counts runes, so without this you could
  // still get a 400.
  const clamp = (v: string) => [...v.trim()].slice(0, NAME_MAX_CHARS).join("");

  const data: MeResponse = await apiCall<MeResponse>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ display_name: clamp(displayName), full_name: clamp(fullName) }),
  });

  return {
    id: data.id,
    email: data.email,
    display_name: data.display_name,
    full_name: data.full_name,
    tier: data.tier,
    cancel_at_period_end: data.cancel_at_period_end,
    onboarding_completed: data.onboarding_completed,
  };
}

// Deletes all data but keeps the account. Sends confirmation 'DELETE', which the backend requires; the UI makes the user type it first.
export async function deleteAllData(password: string): Promise<void> {
  await apiCall<void>("/api/auth/delete-data", {
    method: "POST",
    body: JSON.stringify({ auth_key: await currentAuthKey(password), confirmation: "DELETE" }),
  });
}

// Only emails the confirmation link. The account is deleted when that link is opened (confirmAccountDeletion).
export async function requestAccountDeletion(password: string): Promise<void> {
  await apiCall<void>("/api/auth/request-account-deletion", {
    method: "POST",
    body: JSON.stringify({ auth_key: await currentAuthKey(password) }),
  });
}

export async function completeOnboarding(): Promise<User> {
  const data: MeResponse = await apiCall<MeResponse>("/api/auth/complete-onboarding", { method: "POST" });

  return {
    id: data.id,
    email: data.email,
    display_name: data.display_name,
    full_name: data.full_name,
    tier: data.tier,
    cancel_at_period_end: data.cancel_at_period_end,
    onboarding_completed: data.onboarding_completed,
  };
}
