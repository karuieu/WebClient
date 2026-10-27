"use client";

import { flushSync } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTheme, type Theme } from "@/lib/ui/theme";
import { cx } from "@/lib/ui/cx";
import { Moon, Sun } from "./icons";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const reduce = useReducedMotion();

  const toggle = async () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    if (reduce || !document.startViewTransition) {
      setTheme(next);
      return;
    }
    await document.startViewTransition(() => flushSync(() => setTheme(next))).ready;
    document.documentElement.animate(
      { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0 0)"] },
      { duration: 700, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
    );
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={cx(
        "relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full text-fg transition-[background-color,transform] duration-150 hover:bg-surface active:scale-[0.94]",
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="grid place-items-center"
        >
          {theme === "dark" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
