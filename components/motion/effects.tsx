"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  type SpringOptions,
  type HTMLMotionProps,
} from "motion/react";

import { Slot, type WithAsChild } from "./slot";

/** Pointer effects adapted from Animate UI. Each effect disables itself for coarse pointers. */

type MagneticProps = WithAsChild<
  {
    children?: React.ReactNode;
    strength?: number;
    range?: number;
    springOptions?: SpringOptions;
    ref?: React.Ref<HTMLElement>;
  } & HTMLMotionProps<"div">
>;

function Magnetic({
  ref,
  strength = 0.28,
  range = 110,
  springOptions = { stiffness: 140, damping: 14, mass: 0.4 },
  style,
  onMouseEnter,
  onMouseLeave,
  asChild = false,
  ...props
}: MagneticProps) {
  const localRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, springOptions);
  const y = useSpring(rawY, springOptions);

  React.useEffect(() => {
    // Check window in an effect rather than during prerender, when it does not exist.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const handle = (e: MouseEvent) => {
      const el = localRef.current;
      if (!el) return;
      const { left, top, width, height } = el.getBoundingClientRect();
      const dx = e.clientX - (left + width / 2);
      const dy = e.clientY - (top + height / 2);
      const dist = Math.hypot(dx, dy);

      if (dist <= range) {
        const factor = (1 - dist / range) * strength;
        rawX.set(dx * factor);
        rawY.set(dy * factor);
      } else {
        rawX.set(0);
        rawY.set(0);
      }
    };

    window.addEventListener("mousemove", handle, { passive: true });
    return () => window.removeEventListener("mousemove", handle);
  }, [range, strength, rawX, rawY]);

  const Component = asChild ? Slot : motion.div;

  return (
    <Component
      ref={localRef}
      data-slot="magnetic"
      style={{ display: "inline-block", ...style, x, y }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => onMouseEnter?.(e)}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        rawX.set(0);
        rawY.set(0);
        onMouseLeave?.(e);
      }}
      {...props}
    />
  );
}

type TiltProps = Omit<HTMLMotionProps<"div">, "style" | "transition"> & {
  maxTilt?: number;
  perspective?: number;
  transition?: SpringOptions;
  style?: React.CSSProperties;
};

function Tilt({
  maxTilt = 6,
  perspective = 900,
  style,
  transition = { stiffness: 300, damping: 25, mass: 0.5 },
  children,
  onMouseMove,
  onMouseLeave,
  ...props
}: TiltProps) {
  const rX = useMotionValue(0);
  const rY = useMotionValue(0);
  const sRX = useSpring(rX, transition);
  const sRY = useSpring(rY, transition);

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onMouseMove?.(e);
      if (window.matchMedia("(pointer: coarse)").matches) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      rY.set(nx * maxTilt);
      rX.set(-ny * maxTilt);
    },
    [maxTilt, rX, rY, onMouseMove]
  );

  const handleMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onMouseLeave?.(e);
      rX.set(0);
      rY.set(0);
    },
    [rX, rY, onMouseLeave]
  );

  return (
    <div
      data-slot="tilt"
      style={{ perspective, ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        style={{
          rotateX: sRX,
          rotateY: sRY,
          transformStyle: "preserve-3d",
          willChange: "transform",
          height: "100%",
        }}
        {...props}
      >
        {children}
      </motion.div>
    </div>
  );
}

type ShineProps = React.ComponentProps<"span"> & {
  duration?: number;
  color?: string;
};

/** CSS-based shine avoids a continuously running JavaScript animation; the overlay cannot intercept clicks. */
function Shine({ duration = 2.4, color, style, ...props }: ShineProps) {
  return (
    <span
      aria-hidden="true"
      data-slot="shine"
      className="kn-shine"
      style={
        {
          "--kn-shine-duration": `${duration}s`,
          ...(color ? { "--kn-shine-color": color } : null),
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Magnetic, Tilt, Shine, type MagneticProps, type TiltProps };
