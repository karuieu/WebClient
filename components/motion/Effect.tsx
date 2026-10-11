"use client";

import * as React from "react";
import { motion, type HTMLMotionProps, type Variant } from "motion/react";

import { useIsInView, type UseIsInViewOptions } from "./useIsInView";
import { Slot, type WithAsChild } from "./slot";
import { REVEAL, STAGGER_MS } from "./config";

type SlideDirection = "up" | "down" | "left" | "right";

type Slide = { direction?: SlideDirection; offset?: number };
type Fade = { initialOpacity?: number; opacity?: number };
type Zoom = { initialScale?: number; scale?: number };
type Blur = { initialBlur?: number; blur?: number };

type EffectBaseProps = {
  children?: React.ReactNode;
  delay?: number;
  blur?: Blur | boolean;
  slide?: Slide | boolean;
  fade?: Fade | boolean;
  zoom?: Zoom | boolean;
  ref?: React.Ref<HTMLElement>;
} & UseIsInViewOptions &
  HTMLMotionProps<"div">;

type EffectProps = WithAsChild<EffectBaseProps>;

const DEFAULT_SLIDE_DIRECTION: SlideDirection = "up";
const DEFAULT_SLIDE_OFFSET = 18;
const DEFAULT_FADE_INITIAL_OPACITY = 0;
const DEFAULT_FADE_OPACITY = 1;
const DEFAULT_ZOOM_INITIAL_SCALE = 0.96;
const DEFAULT_ZOOM_SCALE = 1;
const DEFAULT_BLUR_INITIAL_BLUR = 6;
const DEFAULT_BLUR_BLUR = 0;

function Effect({
  ref,
  transition = REVEAL,
  delay = 0,
  inView = false,
  inViewOnce = true,
  inViewMargin,
  blur = false,
  slide = false,
  fade = false,
  zoom = false,
  asChild = false,
  ...props
}: EffectProps) {
  const { ref: localRef, isInView } = useIsInView(ref as React.Ref<HTMLElement>, {
    inView,
    inViewOnce,
    inViewMargin,
  });

  const hiddenVariant: Variant = {};
  const visibleVariant: Variant = {};

  if (slide) {
    const offset =
      typeof slide === "boolean"
        ? DEFAULT_SLIDE_OFFSET
        : (slide.offset ?? DEFAULT_SLIDE_OFFSET);
    const direction =
      typeof slide === "boolean"
        ? DEFAULT_SLIDE_DIRECTION
        : (slide.direction ?? DEFAULT_SLIDE_DIRECTION);
    const axis = direction === "up" || direction === "down" ? "y" : "x";
    hiddenVariant[axis] =
      direction === "right" || direction === "down" ? -offset : offset;
    visibleVariant[axis] = 0;
  }

  if (fade) {
    hiddenVariant.opacity =
      typeof fade === "boolean"
        ? DEFAULT_FADE_INITIAL_OPACITY
        : (fade.initialOpacity ?? DEFAULT_FADE_INITIAL_OPACITY);
    visibleVariant.opacity =
      typeof fade === "boolean"
        ? DEFAULT_FADE_OPACITY
        : (fade.opacity ?? DEFAULT_FADE_OPACITY);
  }

  if (zoom) {
    hiddenVariant.scale =
      typeof zoom === "boolean"
        ? DEFAULT_ZOOM_INITIAL_SCALE
        : (zoom.initialScale ?? DEFAULT_ZOOM_INITIAL_SCALE);
    visibleVariant.scale =
      typeof zoom === "boolean"
        ? DEFAULT_ZOOM_SCALE
        : (zoom.scale ?? DEFAULT_ZOOM_SCALE);
  }

  if (blur) {
    const from =
      typeof blur === "boolean"
        ? DEFAULT_BLUR_INITIAL_BLUR
        : (blur.initialBlur ?? DEFAULT_BLUR_INITIAL_BLUR);
    const to =
      typeof blur === "boolean"
        ? DEFAULT_BLUR_BLUR
        : (blur.blur ?? DEFAULT_BLUR_BLUR);
    hiddenVariant.filter = `blur(${from}px)`;
    visibleVariant.filter = `blur(${to}px)`;
  }

  const Component = asChild ? Slot : motion.div;

  return (
    <Component
      ref={localRef as React.Ref<HTMLDivElement>}
      data-motion-effect=""
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{ hidden: hiddenVariant, visible: visibleVariant }}
      transition={{
        ...transition,
        delay: (transition?.delay ?? 0) + delay / 1000,
      }}
      {...props}
    />
  );
}

function Reveal({
  children,
  blur = true,
  asChild = false,
  ...props
}: Omit<EffectBaseProps, "slide" | "fade" | "zoom"> & {
  /** Animate the child directly; it must forward its ref to a DOM element for useInView. */
  asChild?: boolean;
}) {
  // The caller ensures asChild receives one element; ReactNode alone cannot express that constraint.
  const effectProps = {
    ...props,
    children,
    slide: true,
    fade: true,
    blur,
    inView: true,
    ...(asChild ? { asChild: true as const } : null),
  } as EffectProps;

  return <Effect {...effectProps} />;
}

type StaggerProps = Omit<EffectBaseProps, "children"> & {
  children: React.ReactNode;
  holdDelay?: number;
  asChild?: boolean;
};

function Stagger({
  children,
  delay = 0,
  holdDelay = STAGGER_MS,
  asChild = false,
  ...props
}: StaggerProps) {
  const array = React.Children.toArray(children) as React.ReactElement[];

  return (
    <>
      {array.map((child, index) => {
        const effectProps = {
          ...props,
          delay: delay + index * holdDelay,
          ...(asChild ? { asChild: true as const } : null),
        } as EffectProps;

        return (
          <Effect key={child.key ?? index} {...effectProps}>
            {child}
          </Effect>
        );
      })}
    </>
  );
}

export {
  Effect,
  Reveal,
  Stagger,
  type EffectBaseProps,
  type EffectProps,
  type StaggerProps,
  type SlideDirection,
};
