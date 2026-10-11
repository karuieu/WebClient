"use client";

import { motion, useReducedMotion } from "motion/react";

export function Rise({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.2 } : { type: "spring", bounce: 0, duration: 0.7, delay }}
    >
      {children}
    </motion.div>
  );
}
