"use client";

import { useEffect, useRef } from "react";
import type { CapWidget } from "cap-widget";
import { attachCaptchaWidget, CAPTCHA_ENDPOINT, loadCap } from "@/lib/account/captcha";

const capTheme = {
  "--cap-widget-width": "100%",
  "--cap-widget-height": "56px",
  "--cap-widget-padding": "16px",
  "--cap-border-radius": "16px",
  "--cap-background": "var(--bg)",
  "--cap-border-color": "var(--line-strong)",
  "--cap-color": "var(--fg)",
  "--cap-font": "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  "--cap-checkbox-size": "24px",
  "--cap-checkbox-border": "1px solid var(--line-strong)",
  "--cap-checkbox-background": "var(--bg)",
  "--cap-spinner-color": "var(--fg)",
  "--cap-spinner-background-color": "var(--line)",
  "--cap-focus-ring": "var(--fg)",
  "--cap-invalid-border-color": "var(--danger)",
} as React.CSSProperties;

/** Create the checkbox after its custom element is registered so captcha code reads an upgraded widget. */
export function CaptchaCheckbox() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !CAPTCHA_ENDPOINT) return;
    let widget: CapWidget | null = null;
    let cancelled = false;
    loadCap()
      .then(() => {
        if (cancelled) return;
        widget = document.createElement("cap-widget");
        widget.setAttribute("data-cap-api-endpoint", CAPTCHA_ENDPOINT);
        widget.style.display = "block";
        host.append(widget);
        attachCaptchaWidget(widget);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widget) {
        attachCaptchaWidget(null);
        widget.remove();
      }
    };
  }, []);

  if (!CAPTCHA_ENDPOINT) return null;
  return <div ref={hostRef} style={capTheme} className="min-h-14" />;
}
