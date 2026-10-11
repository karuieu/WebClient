"use client";

import { Effect, RISE } from "@/components/motion";

export function Enter({
  children,
  delay = 0,
  offset = 12,
  blur = true,
}: {
  children: React.ReactElement;
  delay?: number;
  offset?: number;
  blur?: boolean;
}) {
  return (
    <Effect asChild fade slide={{ offset }} blur={blur ? { initialBlur: 4 } : false} delay={delay} transition={RISE}>
      {children}
    </Effect>
  );
}

export function cascade(index: number, base = 120, step = 32, cap = 12) {
  return base + Math.min(index, cap) * step;
}
