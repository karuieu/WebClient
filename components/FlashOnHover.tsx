"use client";

import { useState, type ReactNode } from "react";

export function FlashOnHover({
  restColor,
  className,
  children,
}: {
  restColor: string;
  className?: string;
  children: ReactNode;
}) {
  const [lit, setLit] = useState(false);

  return (
    <span
      className={`select-none ${className ?? ""}`}
      style={{
        color: lit ? "var(--color-accent-soft)" : restColor,
        transition: lit ? "color 150ms ease" : "color 1800ms ease",
      }}
      onMouseEnter={() => setLit(true)}
      onMouseLeave={() => setLit(false)}
    >
      {children}
    </span>
  );
}
