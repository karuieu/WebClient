"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "@/components/kit/icons";
import { SLIDE_GAP, SLIDE_HEIGHT, SLIDE_WIDTH, slideCount, slidesDocument, slidesHeight } from "@/lib/artifacts/artifacts";
import { cx } from "@/lib/ui/cx";

// The frame's light scheme matches the deck's, so the gaps between slides stay see-through in dark mode. A slide is a
// picture here: clicks and double-clicks pass the frame, so without select-none they would select it as a whole.
const FRAME = "pointer-events-none select-none absolute left-0 top-0 origin-top-left border-0 bg-transparent [color-scheme:light]";

function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** A one-slide document laid out at slide size and scaled to the box's width, so it wraps like the real slide. */
export function SlideThumbnail({ document, onLoad }: { document: string; onLoad?: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const scale = useSize(ref).width / SLIDE_WIDTH;
  return (
    <div ref={ref} aria-hidden="true" className="relative aspect-video w-full select-none overflow-hidden">
      {scale > 0 && (
        <iframe
          title=""
          tabIndex={-1}
          srcDoc={document}
          sandbox=""
          scrolling="no"
          onLoad={onLoad}
          className={FRAME}
          style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

/**
 * One slide of the deck, as large as fits the box. The whole deck stays loaded in one frame and moves under a window
 * the size of a slide, so stepping never reloads it, and printing the frame prints every slide.
 */
function SlideStage({
  title,
  document,
  count,
  slide,
  sandbox,
  frameRef,
}: {
  title: string;
  document: string;
  count: number;
  slide: number;
  sandbox: string;
  frameRef?: React.Ref<HTMLIFrameElement>;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { width, height } = useSize(ref);
  const scale = Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT);
  return (
    <div ref={ref} className="grid size-full select-none place-items-center">
      {scale > 0 && (
        <div className="relative overflow-hidden" style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}>
          <iframe
            ref={frameRef}
            title={`${title}, slide ${slide + 1} of ${count}`}
            srcDoc={document}
            sandbox={sandbox}
            scrolling="no"
            className={FRAME}
            style={{
              width: SLIDE_WIDTH,
              height: slidesHeight(count),
              transform: `scale(${scale}) translateY(${-slide * (SLIDE_HEIGHT + SLIDE_GAP)}px)`,
            }}
          />
        </div>
      )}
    </div>
  );
}

const NEXT_KEYS = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"];
const PREVIOUS_KEYS = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"];

/** The slide a key leads to, or null when the key doesn't move through the deck. */
function slideAfterKey(key: string, slide: number, last: number): number | null {
  if (NEXT_KEYS.includes(key)) return Math.min(slide + 1, last);
  if (PREVIOUS_KEYS.includes(key)) return Math.max(slide - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return last;
  return null;
}

// Dark and round over any slide colour; they show on hover or focus, and always on touch screens, which have no hover.
const stageArrow =
  "absolute top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/55 text-white opacity-0 shadow-soft " +
  "transition-[opacity,background-color,transform] duration-150 hover:bg-black/75 active:scale-[0.94] focus-visible:opacity-100 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg group-hover/stage:opacity-100 [@media(hover:none)]:opacity-100 " +
  "disabled:pointer-events-none disabled:!opacity-0";

/**
 * The deck one slide at a time, with every slide in a strip underneath. `slide` is optional so the Library can show a
 * deck without keeping its place.
 */
export function SlideViewer({
  title,
  source,
  sandbox,
  frameRef,
  slide: shown,
  onSlide,
}: {
  title: string;
  source: string;
  sandbox: string;
  frameRef?: React.Ref<HTMLIFrameElement>;
  slide?: number;
  onSlide?: (slide: number) => void;
}) {
  const [own, setOwn] = React.useState(0);
  const count = slideCount(source);
  const last = Math.max(count - 1, 0);
  const slide = Math.min(shown ?? own, last);
  const go = onSlide ?? setOwn;
  const document = React.useMemo(() => slidesDocument(source), [source]);
  const thumbnails = React.useMemo(() => Array.from({ length: count }, (_, i) => slidesDocument(source, { only: i })), [source, count]);
  const stripRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    stripRef.current?.children[slide]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [slide]);

  return (
    <div className="flex h-full flex-col">
      <div className="group/stage relative min-h-0 flex-1">
        <div
          tabIndex={0}
          aria-label={`${title}, slide ${slide + 1} of ${count}. Arrow keys change the slide.`}
          onKeyDown={(e) => {
            const next = slideAfterKey(e.key, slide, last);
            if (next === null) return;
            e.preventDefault();
            go(next);
          }}
          className="size-full rounded-lg p-3 outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:p-5"
        >
          <SlideStage title={title} document={document} count={count} slide={slide} sandbox={sandbox} frameRef={frameRef} />
        </div>
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous slide" onClick={() => go(slide - 1)} disabled={slide === 0} className={cx(stageArrow, "left-5 sm:left-7")}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" aria-label="Next slide" onClick={() => go(slide + 1)} disabled={slide === last} className={cx(stageArrow, "right-5 sm:right-7")}>
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div ref={stripRef} className="flex shrink-0 gap-2 overflow-x-auto border-t border-line px-3 py-3 sm:px-5">
          {thumbnails.map((thumbnail, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              aria-current={i === slide ? "true" : undefined}
              onClick={() => go(i)}
              className={cx(
                "w-24 shrink-0 cursor-pointer overflow-hidden rounded-[4px] transition-[box-shadow,opacity] duration-150",
                i === slide ? "ring-2 ring-fg" : "opacity-70 ring-1 ring-line-strong hover:opacity-100",
              )}
            >
              <SlideThumbnail document={thumbnail} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Print needs modals, and same-origin lets this page call it; scripts stay off.
const PRINT_SANDBOX = "allow-same-origin allow-modals";

/**
 * The browser's print dialog for the whole deck, one slide per page, whichever tab the panel is on. Saving as PDF there
 * gives the file; nothing leaves the browser.
 */
export function printSlides(title: string, source: string): void {
  const frame = window.document.createElement("iframe");
  frame.setAttribute("sandbox", PRINT_SANDBOX);
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-${SLIDE_WIDTH * 2}px;top:0;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;border:0`;
  frame.srcdoc = slidesDocument(source, { title });
  frame.addEventListener("load", () => {
    const view = frame.contentWindow;
    if (!view) return frame.remove();
    // Chrome waits in print(); Firefox returns at once and reports the end with afterprint.
    view.addEventListener("afterprint", () => frame.remove());
    view.print();
    setTimeout(() => frame.remove(), 60_000);
  });
  window.document.body.appendChild(frame);
}

/** Full screen when the browser allows it; otherwise it still covers the whole window. */
function useFullscreen(ref: React.RefObject<HTMLElement | null>, onExit: () => void) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el?.requestFullscreen) return;
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === el) entered = true;
      else if (entered) onExit();
    };
    document.addEventListener("fullscreenchange", onChange);
    el.requestFullscreen().catch(() => {});
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
    };
  }, [ref, onExit]);
}

const control =
  "grid size-11 cursor-pointer place-items-center rounded-full text-white transition-[background-color,opacity] duration-150 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-30";

/** Starts on the panel's slide and leaves the panel on the last one shown. */
export function SlidePresenter({
  title,
  source,
  slide,
  onSlide,
  onClose,
}: {
  title: string;
  source: string;
  slide: number;
  onSlide: (slide: number) => void;
  onClose: () => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const count = slideCount(source);
  const last = Math.max(count - 1, 0);
  const document = React.useMemo(() => slidesDocument(source), [source]);
  useFullscreen(rootRef, onClose);

  React.useEffect(() => {
    rootRef.current?.focus();
    // Capture, so the panel underneath never sees these keys: its Escape would close it.
    const onKey = (e: KeyboardEvent) => {
      // Enter and Space still press a focused button, such as Stop presenting.
      if ((e.key === " " || e.key === "Enter") && (e.target as HTMLElement).closest("button")) return;
      const next = slideAfterKey(e.key, slide, last);
      if (next !== null) onSlide(next);
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [slide, last, onSlide, onClose]);

  // A tap on the left third goes back, anywhere else forward.
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onSlide(Math.min(Math.max(slide + (e.clientX - box.left < box.width / 3 ? -1 : 1), 0), last));
  };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title}, presenting`}
      tabIndex={-1}
      className="group fixed inset-0 z-[70] select-none bg-black outline-none"
    >
      <div onClick={onStageClick} className="size-full cursor-pointer">
        <SlideStage title={title} document={document} count={count} slide={slide} sandbox="" />
      </div>
      <div className="absolute right-3 top-3 rounded-full bg-black/60 opacity-60 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" aria-label="Stop presenting" title="Stop presenting · Esc" onClick={onClose} className={control}>
          <X className="size-5" />
        </button>
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/60 px-1 opacity-60 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" aria-label="Previous slide" onClick={() => onSlide(Math.max(slide - 1, 0))} disabled={slide === 0} className={control}>
          <ChevronLeft className="size-5" />
        </button>
        <p aria-live="polite" className="min-w-14 text-center font-mono text-[13px] tabular-nums text-white">
          <span className="sr-only">Slide </span>
          {slide + 1}
          <span aria-hidden="true"> / </span>
          <span className="sr-only"> of </span>
          {count}
        </p>
        <button type="button" aria-label="Next slide" onClick={() => onSlide(Math.min(slide + 1, last))} disabled={slide === last} className={control}>
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>,
    window.document.body,
  );
}
