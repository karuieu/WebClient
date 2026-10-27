"use client";

import * as React from "react";
import { cx } from "@/lib/ui/cx";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const CELL_W = 10;
const CELL_H = 16;
const BRIGHTEN_RADIUS = 110;

type Cell = { ch: string; noise: number };

const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/**
 * A field of base64 characters that keep re-encrypting; characters near the
 * pointer brighten. Position it with `className` (absolute inset-0). Canvas,
 * because a few thousand glyphs would be as many DOM nodes. Pauses off-screen
 * and draws one still frame under reduced motion.
 */
export function CipherField({ className }: { className?: string }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cells: Cell[] = [];
    let cols = 0;
    let rows = 0;
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = false;
    let lastMutate = 0;
    const pointer = { x: 0, y: 0, active: false };
    let color = "#000";
    let font = "500 11px monospace";

    const readColor = () => {
      const cs = getComputedStyle(wrap);
      color = cs.color;
      font = `500 11px ${cs.fontFamily}`;
    };

    const build = () => {
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL_W);
      rows = Math.ceil(h / CELL_H);
      cells = Array.from({ length: cols * rows }, () => ({ ch: pick(), noise: Math.random() }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = color;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c];
          const x = c * CELL_W + CELL_W / 2;
          const y = r * CELL_H + CELL_H / 2;
          let alpha = cell.noise < 0.55 ? 0.07 + cell.noise * 0.06 : 0;
          if (pointer.active) {
            const d = Math.hypot(x - pointer.x, y - pointer.y);
            if (d < BRIGHTEN_RADIUS) alpha = Math.max(alpha, (1 - d / BRIGHTEN_RADIUS) * 0.55);
          }
          if (alpha < 0.02) continue;
          ctx.globalAlpha = alpha;
          ctx.fillText(cell.ch, x, y);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      if (!visible) return;
      if (cells.length && now - lastMutate > 90) {
        lastMutate = now;
        const n = Math.max(1, (cells.length * 0.035) | 0);
        for (let i = 0; i < n; i++) cells[(Math.random() * cells.length) | 0].ch = pick();
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    readColor();
    build();
    draw();

    const ro = new ResizeObserver(() => {
      build();
      draw();
    });
    ro.observe(wrap);

    // The theme toggle flips the `dark` class, which changes the text colour.
    const mo = new MutationObserver(() => {
      readColor();
      draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting && !reduce;
      if (visible && !was) raf = requestAnimationFrame(tick);
      if (!visible) cancelAnimationFrame(raf);
    });
    io.observe(wrap);

    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
      if (reduce) draw();
    };
    const onLeave = () => {
      pointer.active = false;
      if (reduce) draw();
    };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden="true" className={cx("select-none font-mono text-fg", className)}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
