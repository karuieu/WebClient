"use client";

import * as React from "react";

const RECENT_MODE_KEY = "karui-sidebar-recent-mode";

export type RecentMode = "none" | "dates";

export function useRecentMode(): [RecentMode, (mode: RecentMode) => void] {
  const [mode, setMode] = React.useState<RecentMode>("dates");
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_MODE_KEY);
      if (stored === "none" || stored === "dates") setMode(stored);
    } catch {}
  }, []);
  const update = React.useCallback((next: RecentMode) => {
    setMode(next);
    try {
      localStorage.setItem(RECENT_MODE_KEY, next);
    } catch {}
  }, []);
  return [mode, update];
}

const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function calendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function groupChats<T extends { id: string; updatedAt?: string }>(
  chats: T[],
  now: Date | null,
): { id: string; label: string; chats: T[] }[] {
  const timestamp = (chat: T): number => {
    const time = Date.parse(chat.updatedAt ?? "");
    return Number.isFinite(time) ? time : -Infinity;
  };
  const sorted = [...chats].sort((a, b) => timestamp(b) - timestamp(a));
  if (!now || sorted.every((chat) => !Number.isFinite(timestamp(chat)))) {
    return sorted.length ? [{ id: "recent", label: "Recent", chats: sorted }] : [];
  }
  const groups = new Map<string, { id: string; label: string; chats: T[] }>();
  const undated: T[] = [];
  for (const chat of sorted) {
    const time = timestamp(chat);
    if (!Number.isFinite(time)) {
      undated.push(chat);
      continue;
    }
    const date = new Date(time);
    const days = calendarDay(now) - calendarDay(date);
    const id = days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `day-${calendarDay(date)}` : "older";
    let group = groups.get(id);
    if (!group) {
      const label = days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? dateLabel.format(date) : "Older";
      group = { id, label, chats: [] };
      groups.set(id, group);
    }
    group.chats.push(chat);
  }
  const result = [...groups.values()];
  if (undated.length) result.push({ id: "undated", label: "Earlier chats", chats: undated });
  return result;
}
