import type Cap from "cap-widget";
import type { CapSolveEvent, CapWidget } from "cap-widget";

// https://<cap instance>/<site key>/ — baked in at build time like NEXT_PUBLIC_API_URL.
export const CAPTCHA_ENDPOINT = process.env.NEXT_PUBLIC_CAP_ENDPOINT || "";

const FAILED = "Couldn't verify you're human. Check your connection and try again.";

let pending: Promise<Cap> | null = null;
let visibleWidget: CapWidget | null = null;

export async function loadCap(): Promise<typeof Cap> {
  const capOrigin = new URL(CAPTCHA_ENDPOINT).origin;
  // Load WASM from our Cap instance so third-party CDNs do not see visitors and CSP needs only the Cap origin.
  window.CAP_CUSTOM_WASM_URL = `${capOrigin}/assets/cap_wasm_bg.wasm`;
  window.CAP_CUSTOM_HASHWX_URL = `${capOrigin}/assets/hashwx.wasm`;
  // Cap's bot check runs inline in a srcdoc frame, which inherits our nonce-only CSP.
  window.CAP_SCRIPT_NONCE ??= document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || undefined;
  // Imported lazily: the widget reads `navigator` at import time, which breaks SSR.
  return (await import("cap-widget")).default;
}

export function attachCaptchaWidget(widget: CapWidget | null): void {
  visibleWidget = widget;
}

async function solve(): Promise<Cap> {
  const CapClass = await loadCap();
  const cap = new CapClass({ apiEndpoint: CAPTCHA_ENDPOINT });
  try {
    await cap.solve();
  } catch (error) {
    cap.widget.remove();
    throw error;
  }
  return cap;
}

export function prefetchCaptcha(): void {
  if (!CAPTCHA_ENDPOINT || pending || visibleWidget) return;
  pending = solve();
  // A failed prefetch is retried by takeCaptchaToken; this only silences the rejection.
  pending.catch(() => {});
}

function widgetToken(widget: CapWidget): Promise<string> {
  if (widget.token) return Promise.resolve(widget.token);
  return new Promise((resolve, reject) => {
    const onSolve = (event: CapSolveEvent) => {
      cleanup();
      resolve(event.detail.token);
    };
    const onError = () => {
      cleanup();
      reject(new Error(FAILED));
    };
    const cleanup = () => {
      widget.removeEventListener("solve", onSolve);
      widget.removeEventListener("error", onError);
    };
    widget.addEventListener("solve", onSolve);
    widget.addEventListener("error", onError);
    widget.solve().catch(() => {});
  });
}

export async function takeCaptchaToken(): Promise<string | undefined> {
  if (!CAPTCHA_ENDPOINT) return undefined;

  if (visibleWidget) {
    const widget = visibleWidget;
    try {
      return await widgetToken(widget);
    } catch {
      throw new Error(FAILED);
    } finally {
      widget.reset();
    }
  }

  const prefetched = pending;
  pending = null;
  try {
    let cap = prefetched ? await prefetched.catch(() => null) : null;
    if (!cap?.token) {
      cap?.widget.remove();
      cap = await solve();
    }
    const token = cap.token;
    cap.widget.remove();
    if (!token) throw new Error("no token");
    return token;
  } catch {
    throw new Error(FAILED);
  }
}
