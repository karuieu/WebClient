"use client";

import * as React from "react";

const noop = () => () => {};

export function useMounted() {
  return React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function useNow() {
  const mounted = useMounted();
  const [now] = React.useState(() => new Date());
  return mounted ? now : null;
}

export function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Measured before paint, so a narrow layout doesn't flash the wide one first.
export function useNarrow(ref: React.RefObject<HTMLElement | null>, below: number) {
  const [narrow, setNarrow] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setNarrow(el.getBoundingClientRect().width < below);
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < below));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, below]);
  return narrow;
}
