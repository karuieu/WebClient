import type { Transition } from "motion/react";

export const REVEAL: Transition = {
  type: "spring",
  stiffness: 140,
  damping: 22,
  mass: 0.9,
};

export const SNAPPY: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
};

export const TAP: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 30,
};

export const DIALOG: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 26,
  mass: 0.8,
};

export const EXIT: Transition = { duration: 0.16, ease: [0.4, 0, 1, 1] };

export const STAGGER_MS = 55;

export const RISE: Transition = { type: "spring", bounce: 0, duration: 0.7 };

export const IN_VIEW_MARGIN = "0px 0px -10% 0px";
