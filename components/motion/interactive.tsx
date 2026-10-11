"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";

import { SNAPPY, TAP } from "./config";

/** Click and state-change effects adapted from Animate UI. */

type Ripple = { id: number; x: number; y: number };

type RippleButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  hoverScale?: number;
  tapScale?: number;
  rippleColor?: string;
};

function RippleButton({
  ref,
  onClick,
  hoverScale = 1.02,
  tapScale = 0.97,
  rippleColor = "currentColor",
  style,
  children,
  ...props
}: RippleButtonProps) {
  const [ripples, setRipples] = React.useState<Ripple[]>([]);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  React.useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = buttonRef.current;
      if (button) {
        const rect = button.getBoundingClientRect();
        setRipples((prev) => [
          ...prev,
          {
            // Date.now() can repeat for two clicks in the same millisecond, producing duplicate React keys.
            id: Math.random(),
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          },
        ]);
      }
      onClick?.(event);
    },
    [onClick]
  );

  return (
    <motion.button
      ref={buttonRef}
      data-slot="ripple-button"
      onClick={handleClick}
      whileHover={{ scale: hoverScale }}
      whileTap={{ scale: tapScale }}
      transition={TAP}
      style={{ position: "relative", overflow: "hidden", ...style }}
      {...props}
    >
      {children}
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          aria-hidden="true"
          initial={{ scale: 0, opacity: 0.35 }}
          animate={{ scale: 12, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          onAnimationComplete={() =>
            setRipples((prev) => prev.filter((r) => r.id !== ripple.id))
          }
          style={{
            position: "absolute",
            top: ripple.y - 10,
            left: ripple.x - 10,
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: rippleColor,
            pointerEvents: "none",
          }}
        />
      ))}
    </motion.button>
  );
}

type SlidingIndicatorProps = Omit<HTMLMotionProps<"span">, "layoutId"> & {

  active: boolean;
  group: string;
};

function SlidingIndicator({
  active,
  group,
  className,
  style,
  ...props
}: SlidingIndicatorProps) {
  if (!active) return null;

  return (
    <motion.span
      layoutId={group}
      aria-hidden="true"
      data-slot="sliding-indicator"
      transition={SNAPPY}
      className={className}
      style={{ position: "absolute", pointerEvents: "none", ...style }}
      {...props}
    />
  );
}

type AutoHeightProps = Omit<
  HTMLMotionProps<"div">,
  "animate" | "style" | "children"
> & {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  deps?: unknown;
};

function AutoHeight({ children, deps, style, ...props }: AutoHeightProps) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | "auto">("auto");

  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [deps]);

  return (
    <motion.div
      data-slot="auto-height"
      animate={{ height }}
      transition={SNAPPY}
      style={{ overflow: "hidden", ...style }}
      {...props}
    >
      <div ref={innerRef}>{children}</div>
    </motion.div>
  );
}

export {
  RippleButton,
  SlidingIndicator,
  AutoHeight,
  type RippleButtonProps,
  type SlidingIndicatorProps,
};
