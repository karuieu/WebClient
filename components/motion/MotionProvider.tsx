"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import type { JSX, ReactNode } from "react";

export function MotionProvider({ children }: { children: ReactNode }): JSX.Element {
  const reduce = useReducedMotion();
  return <MotionConfig reducedMotion="user" skipAnimations={reduce ?? false}>{children}</MotionConfig>;
}
