"use client";

import * as React from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "./themeScript";

export { themeScript } from "./themeScript";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>("light");
  const [preference, setPreferenceState] = React.useState<ThemePreference>("system");

  React.useEffect(() => {
    setThemeState(readTheme());
    setPreferenceState(readStored() ?? "system");
    const mo = new MutationObserver(() => {
      setThemeState(readTheme());
      setPreferenceState(readStored() ?? "system");
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = (e: MediaQueryListEvent) => {
      if (!readStored()) document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", onSystem);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", onSystem);
    };
  }, []);

  const setPreference = React.useCallback((next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    const resolved = next === "system" ? systemTheme() : next;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    setPreferenceState(next);
    setThemeState(resolved);
  }, []);

  const setTheme = React.useCallback((next: Theme) => setPreference(next), [setPreference]);

  return { theme, setTheme, preference, setPreference };
}
