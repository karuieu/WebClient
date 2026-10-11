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
