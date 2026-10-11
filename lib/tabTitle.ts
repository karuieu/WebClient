import * as React from "react";
import { accountSettingKey } from "./session";

const STORAGE_KEY = "karui_tab_names";

//Off by default: the browser keeps tab titles in its history.
export function getTabNamesEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(accountSettingKey(STORAGE_KEY)) === "1";
  } catch {
    return false;
  }
}

export function setTabNamesEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(accountSettingKey(STORAGE_KEY), enabled ? "1" : "0");
  } catch {}
}

export function useTabTitle(name: string | null | undefined, fallback: string, active = true): void {
  React.useEffect(() => {
    if (!active) return;
    const title = `Karui · ${getTabNamesEnabled() && name ? name : fallback}`;
    const previous = document.title;
    document.title = title;
    // Navigating away may already have put the next page's own title in; keep that one.
    return () => {
      if (document.title === title) document.title = previous;
    };
  }, [name, fallback, active]);
}
