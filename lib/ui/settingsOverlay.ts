
export const SETTINGS_PARAM = "settings";

export const SETTINGS_TABS = ["general", "usage", "memory", "providers", "billing", "security", "danger", "connectors", "skills", "your-memory"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "general";

export function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return !!value && (SETTINGS_TABS as readonly string[]).includes(value);
}

export function settingsHref(pathname: string, tab: SettingsTab, current?: URLSearchParams): string {
  const params = new URLSearchParams(current?.toString() ?? "");
  params.set(SETTINGS_PARAM, tab);
  return `${pathname}?${params.toString()}`;
}

// Not router.push/replace: a navigation re-resolves the page metadata and the tab shows the URL for a moment.
export function setSettingsUrl(href: string, mode: "push" | "replace"): void {
  if (mode === "push") window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
}

export function closedSettingsHref(pathname: string, current?: URLSearchParams): string {
  const params = new URLSearchParams(current?.toString() ?? "");
  params.delete(SETTINGS_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
