"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const EDGE = 6;

const noise = (length: number) => Array.from({ length }, () => B64[(Math.random() * 64) | 0]).join("");


export function Decrypt({ text, delay = 0, duration = 900 }: { text: string; delay?: number; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(text);

  React.useEffect(() => {
    if (reduce) return;
    const sealed = noise(text.length);
    const start = performance.now() + delay;
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      let out = "";
      for (let i = 0; i < text.length; i++) {
        const edge = p * (text.length + EDGE) - i;
        out += edge > EDGE ? text[i] : edge > 0 ? B64[(Math.random() * 64) | 0] : sealed[i];
      }
      setShown(out);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, duration, reduce]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{reduce ? text : shown}</span>
    </>
  );
}
