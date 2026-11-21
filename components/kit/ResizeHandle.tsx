"use client";

import * as React from "react";
import { cx } from "@/lib/ui/cx";

const STEP = 24;

/**
 * The drag strip on a panel's edge. Dragging or the arrow keys resize, a double-click resets.
 * The parent owns the width and positions the strip with `className`.
 */
export function ResizeHandle({
  label,
  edge,
  width,
  min,
  max,
  defaultWidth,
  dragging,
  onDraggingChange,
  onResize,
  onCommit,
  className,
}: {
  label: string;
  /** The panel's edge the strip sits on: dragging away from the panel widens it. */
  edge: "left" | "right";
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  dragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  /** Every move while dragging. */
  onResize: (width: number) => void;
  /** The final width: end of a drag, a key press or a reset. */
  onCommit: (width: number) => void;
  className?: string;
}): React.JSX.Element {
  const grow = edge === "right" ? 1 : -1;
  const clamp = (w: number) => Math.round(Math.min(Math.max(w, min), max));

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    // Without this the drag also selects text, and the browser cancels the pointer to drag that selection.
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    onDraggingChange(true);
    let next = startWidth;
    const move = (m: PointerEvent) => {
      next = clamp(startWidth + grow * (m.clientX - startX));
      onResize(next);
    };
    // Fires after pointerup and pointercancel alike; a cancelled drag sends no pointerup and would leave the page unclickable.
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("lostpointercapture", end);
      onDraggingChange(false);
      onCommit(next);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", end);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={startDrag}
      onDoubleClick={() => onCommit(clamp(defaultWidth))}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onCommit(clamp(width + grow * STEP));
        if (e.key === "ArrowLeft") onCommit(clamp(width - grow * STEP));
      }}
      className={cx("group absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none", className)}
    >
      <span
        className={cx(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-[background-color,width] duration-150",
          dragging ? "w-0.5 bg-fg/40" : "group-hover:w-0.5 group-hover:bg-fg/25 group-focus-visible:bg-fg/40",
        )}
      />
    </div>
  );
}
