import * as React from "react";
import { API_URL, apiFetch } from "./api";

const DISMISSED_KEY = "karui_announcement_dismissed";

export type AppAnnouncement = { title: string; message: string; updatedAt: string };

export function parseAnnouncement(body: unknown): AppAnnouncement | null {
  if (!body || typeof body !== "object") return null;
  const value: unknown = (body as Record<string, unknown>).announcement;
  if (!value || typeof value !== "object") return null;
  const { title, message, updated_at: updatedAt } = value as Record<string, unknown>;
  if (typeof title !== "string" || typeof message !== "string" || typeof updatedAt !== "string") return null;
  return { title, message, updatedAt };
}

async function getAnnouncement(): Promise<AppAnnouncement | null> {
  const response = await apiFetch(`${API_URL}/api/app/announcement`);
  if (!response.ok) return null;
  return parseAnnouncement(await response.json().catch(() => null));
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * A dismissed announcement stays hidden in this browser until the admin publishes a new one or edits it
 * (a new updated_at). It is fetched again whenever the tab comes back, so an app left open picks it up.
 */
export function useAnnouncement(): { announcement: AppAnnouncement | null; open: boolean; dismiss: () => void } {
  const [announcement, setAnnouncement] = React.useState<AppAnnouncement | null>(null);
  const [dismissed, setDismissed] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const load = (): void => {
      if (document.visibilityState !== "visible") return;
      getAnnouncement().then(
        (next) => {
          if (!active) return;
          setDismissed(readDismissed());
          setAnnouncement(next);
        },
        () => {},
      );
    };
    load();
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const dismiss = (): void => {
    if (!announcement) return;
    setDismissed(announcement.updatedAt);
    try {
      window.localStorage.setItem(DISMISSED_KEY, announcement.updatedAt);
    } catch {}
  };

  return { announcement, open: announcement !== null && dismissed !== announcement.updatedAt, dismiss };
}
