"use client";

import { cx } from "@/lib/ui/cx";
import { useMounted } from "./useMounted";

export type Keys = readonly string[];

const MAC: Record<string, string> = { Mod: "⌘", Shift: "⇧", Alt: "⌥" };

/** The shortcut as this device writes it; null until mounted, since the server can't know the platform. */
export function useShortcut(keys: Keys): string | null {
  const mounted = useMounted();
  if (!mounted) return null;
  return /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? keys.map((k) => MAC[k] ?? k).join("")
    : keys.map((k) => (k === "Mod" ? "Ctrl" : k)).join(" ");
}

export function Kbd({ keys, className }: { keys: Keys; className?: string }) {
  const label = useShortcut(keys);
  return label ? <kbd className={cx("font-mono text-[11px] tracking-normal", className)}>{label}</kbd> : null;
}
