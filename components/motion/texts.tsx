"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  type SpringOptions,
  type HTMLMotionProps,
  type Transition,
} from "motion/react";

import { useIsInView, type UseIsInViewOptions } from "./useIsInView";

type CountingNumberProps = Omit<React.ComponentProps<"span">, "children"> & {
  number: number;
  fromNumber?: number;
  decimalPlaces?: number;
  decimalSeparator?: string;
  groupSeparator?: string;
  transition?: SpringOptions;
  delay?: number;
} & UseIsInViewOptions;

function CountingNumber({
  ref,
  number,
  fromNumber = 0,
  inView = true,
  inViewOnce = true,
  inViewMargin,
  decimalPlaces = 0,
  decimalSeparator = ",",
  groupSeparator = " ",
  transition = { stiffness: 90, damping: 50 },
  delay = 0,
  ...props
}: CountingNumberProps) {
  const { ref: localRef, isInView } = useIsInView(ref as React.Ref<HTMLElement>, {
    inView,
    inViewOnce,
    inViewMargin,
  });

  const motionVal = useMotionValue(fromNumber);
  const springVal = useSpring(motionVal, transition);

  const format = React.useCallback(
    (value: number) => {
      const raw =
        decimalPlaces > 0
          ? value.toFixed(decimalPlaces)
          : Math.round(value).toString();

      const [intRaw, fracPart] = raw.split(".");
      const intPart = groupSeparator
        ? intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator)
        : intRaw;

      return fracPart ? `${intPart}${decimalSeparator}${fracPart}` : intPart;
    },
    [decimalPlaces, decimalSeparator, groupSeparator]
  );

  React.useEffect(() => {
    if (!isInView) return;
    const id = setTimeout(() => motionVal.set(number), delay);
    return () => clearTimeout(id);
  }, [isInView, number, motionVal, delay]);

  React.useEffect(() => {
    return springVal.on("change", (latest) => {
      if (localRef.current) localRef.current.textContent = format(latest);
    });
  }, [springVal, format, localRef]);

  return (
    <span ref={localRef} data-slot="counting-number" {...props}>
      {format(fromNumber)}
    </span>
  );
}

type TypingTextProps = Omit<React.ComponentProps<"span">, "children"> & {
  text: string;
  speed?: number;
  delay?: number;
  holdCaret?: boolean;
} & UseIsInViewOptions;

/** TypingText exposes the full sentence to assistive technology and honors prefers-reduced-motion. */
function TypingText({
  ref,
  text,
  speed = 38,
  delay = 0,
  holdCaret = false,
  inView = true,
  inViewOnce = true,
  inViewMargin,
  ...props
}: TypingTextProps) {
  const { ref: localRef, isInView } = useIsInView(ref as React.Ref<HTMLElement>, {
    inView,
    inViewOnce,
    inViewMargin,
  });

  const [shown, setShown] = React.useState(0);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!isInView) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length);
      setDone(true);
      return;
    }

    let index = 0;
    let interval: ReturnType<typeof setInterval>;

    const start = setTimeout(() => {
      interval = setInterval(() => {
        index += 1;
        setShown(index);
        if (index >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [isInView, text, speed, delay]);

  return (
    <span ref={localRef} data-slot="typing-text" aria-label={text} {...props}>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {(!done || holdCaret) && (
        <span aria-hidden="true" className="kn-type-caret">
          |
        </span>
      )}
    </span>
  );
}

type GradientTextProps = Omit<React.ComponentProps<"span">, "children"> & {
  text: string;
  gradient?: string;
  transition?: Transition;
};

function GradientText({
  text,
  style,
  gradient = "linear-gradient(90deg, #7c3aed 0%, #a78bfa 25%, #60a5fa 50%, #a78bfa 75%, #7c3aed 100%)",
  transition = { duration: 8, repeat: Infinity, ease: "linear" },
  ...props
}: GradientTextProps) {
  return (
    <span
      data-slot="gradient-text"
      style={{ position: "relative", display: "inline-block", ...style }}
      {...props}
    >
      <motion.span
        style={{
          backgroundImage: gradient,
          color: "transparent",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          backgroundSize: "300% 100%",
        }}
        initial={{ backgroundPosition: "0% 50%" }}
        animate={{ backgroundPosition: "300% 50%" }}
        transition={transition}
      >
        {text}
      </motion.span>
    </span>
  );
}

type HighlightTextProps = Omit<HTMLMotionProps<"span">, "children"> & {
  text: string;
  color?: string;
  delay?: number;
} & UseIsInViewOptions;

function HighlightText({
  ref,
  text,
  color = "rgba(124, 58, 237, 0.28)",
  style,
  inView = true,
  inViewOnce = true,
  inViewMargin,
  transition = { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
  delay = 0,
  ...props
}: HighlightTextProps) {
  const { ref: localRef, isInView } = useIsInView(ref as React.Ref<HTMLElement>, {
    inView,
    inViewOnce,
    inViewMargin,
  });

  return (
    <motion.span
      ref={localRef}
      data-slot="highlight-text"
      initial={{ backgroundSize: "0% 100%" }}
      animate={isInView ? { backgroundSize: "100% 100%" } : undefined}
      transition={{
        ...transition,
        delay: (transition?.delay ?? 0) + delay / 1000,
      }}
      style={{
        backgroundImage: `linear-gradient(${color}, ${color})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "left center",
        backgroundSize: "0% 100%",
        padding: "0 0.12em",
        borderRadius: "0.18em",
        display: "inline",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
        ...style,
      }}
      {...props}
    >
      {text}
    </motion.span>
  );
}

export {
  CountingNumber,
  TypingText,
  GradientText,
  HighlightText,
  type CountingNumberProps,
  type TypingTextProps,
  type GradientTextProps,
  type HighlightTextProps,
};
