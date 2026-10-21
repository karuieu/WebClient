"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Lock } from "@/components/kit/icons";
import { cx } from "@/lib/cx";
import { ChatHeader, type EnclaveState, type HeaderProject } from "../chat/ChatView";
import { Composer } from "../Composer";
import { ProjectPanel, type ProjectPanelProps } from "./ProjectPanel";

const HIDDEN_KEY = "karui-project-panel-hidden";
const WIDTH_KEY = "karui-project-panel-width";
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 400;
const MIN_CHAT_WIDTH = 360;
const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

export type ProjectPanelState = {
  hidden: boolean;

  drawer: boolean;

  toggle: () => void;
  show: () => void;
  hide: () => void;
  closeDrawer: () => void;
};

export function useProjectPanel(): ProjectPanelState {
  const [hidden, setHidden] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);

  React.useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {}
  }, []);

  const persist = React.useCallback((h: boolean) => {
    setHidden(h);
    try {
      localStorage.setItem(HIDDEN_KEY, h ? "1" : "0");
    } catch {}
  }, []);

  const desktop = () => window.matchMedia("(min-width: 768px)").matches;

  return {
    hidden,
    drawer,
    toggle: () => (desktop() ? persist(!hidden) : setDrawer((d) => !d)),
    show: () => (desktop() ? persist(false) : setDrawer(true)),
    hide: () => persist(true),
    closeDrawer: () => setDrawer(false),
  };
}

export function ProjectWorkspace({
  state,
  panel,
  suspended,
  children,
}: {
  state: ProjectPanelState;
  panel: ProjectPanelProps;
  suspended?: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const { drawer, closeDrawer } = state;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  const [rootWidth, setRootWidth] = React.useState(Infinity);
  const [expanded, setExpanded] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const maxWidth = Math.max(rootWidth - MIN_CHAT_WIDTH, MIN_WIDTH);
  const clampWidth = (w: number) => Math.round(Math.min(Math.max(w, MIN_WIDTH), maxWidth));
  const shown = expanded ? rootWidth : Math.min(width, maxWidth);
  // Width changes from the window or the sliding sidebar don't animate: a lagging spring uncovers the chat.
  const [settledWidth, setSettledWidth] = React.useState(rootWidth);
  const following = settledWidth !== rootWidth;
  React.useEffect(() => setSettledWidth(rootWidth), [rootWidth]);

  React.useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      if (saved) setWidth(Math.max(saved, MIN_WIDTH));
    } catch {}
  }, []);

  const editorOpen = !!panel.library.open;
  React.useEffect(() => {
    if (!editorOpen) setExpanded(false);
  }, [editorOpen]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setRootWidth(root.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const commit = (w: number) => {
    const clamped = clampWidth(w);
    setExpanded(false);
    setWidth(clamped);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {}
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startW = shown;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setExpanded(false);
    setDragging(true);
    const move = (m: PointerEvent) => setWidth(clampWidth(startW + (startX - m.clientX)));
    const up = (u: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      setDragging(false);
      commit(startW + (startX - u.clientX));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    const onResize = () => window.innerWidth >= 768 && closeDrawer();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [drawer, closeDrawer]);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1">
      <div className={cx("flex min-w-0 flex-1 flex-col", expanded && "overflow-hidden")}>{children}</div>

      <AnimatePresence initial={false}>
        {!state.hidden && !suspended && (
          <motion.div
            key="docked"
            initial={{ width: 0 }}
            // 100% rather than a measured width, so it follows the sliding sidebar in the same frame.
            animate={{ width: expanded ? "100%" : shown }}
            exit={{ width: 0 }}
            transition={reduce || dragging || following ? { duration: 0 } : spring}
            className="relative hidden shrink-0 overflow-hidden md:flex"
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize project panel"
              aria-valuenow={shown}
              aria-valuemin={MIN_WIDTH}
              aria-valuemax={maxWidth}
              tabIndex={0}
              title="Drag to resize · double-click to reset"
              onPointerDown={startDrag}
              onDoubleClick={() => commit(DEFAULT_WIDTH)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") commit(shown + 24);
                if (e.key === "ArrowRight") commit(shown - 24);
              }}
              className="group absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none"
            >
              <span
                className={cx(
                  "absolute inset-y-0 left-0 w-px transition-[background-color,width] duration-150",
                  dragging ? "w-0.5 bg-fg/40" : "group-hover:w-0.5 group-hover:bg-fg/25 group-focus-visible:bg-fg/40",
                )}
              />
            </div>
            <div className={cx("flex h-full", dragging && "pointer-events-none select-none")}>
              <ProjectPanel
                {...panel}
                variant="docked"
                width={shown}
                expanded={expanded}
                onToggleExpand={() => setExpanded((x) => !x)}
                onClose={state.hide}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3 }}
              onClick={closeDrawer}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
              aria-hidden="true"
            />
            <motion.div
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Project"
              initial={reduce ? { opacity: 0 } : { x: "100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "100%", transition: { type: "spring", bounce: 0, duration: 0.3 } }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed inset-y-0 right-0 z-50 flex shadow-soft md:hidden"
            >
              <ProjectPanel {...panel} variant="drawer" onClose={closeDrawer} onNavigate={closeDrawer} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const rise = { type: "spring", bounce: 0, duration: 1 } as const;

export function ProjectHome({
  name,
  goal,
  header,
  enclave,
  composer,
  libraryNote,
  onAddGoal,
}: {
  name: string;
  goal: string;
  header: HeaderProject;
  enclave?: EnclaveState;
  composer: React.ComponentProps<typeof Composer>;

  libraryNote?: string;
  onAddGoal: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ChatHeader title="" enclave={enclave} project={header} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[12vh] pt-6 sm:px-6">
        <div className="w-full max-w-[44rem]">
          <h1 className="text-title overflow-hidden px-1 pb-[0.08em]">
            <motion.span
              key={name}
              data-motion-effect=""
              className="block truncate"
              initial={{ y: "105%" }}
              animate={{ y: "0%" }}
              transition={reduce ? { duration: 0 } : { ...rise, delay: 0.05 }}
            >
              {name}
            </motion.span>
          </h1>
          <motion.div
            data-motion-effect=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.2 }}
            className="mt-3 px-1"
          >
            {goal ? (
              <p className="line-clamp-3 max-w-[36rem] text-pretty text-[1.0625rem] leading-relaxed text-muted">{goal}</p>
            ) : (
              <button
                type="button"
                onClick={onAddGoal}
                className="cursor-pointer text-[1.0625rem] text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg"
              >
                Add a goal for this project
              </button>
            )}
          </motion.div>

          <motion.div
            data-motion-effect=""
            initial={{ opacity: 0, y: 24, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : { ...rise, duration: 0.9, delay: 0.25 }}
            className="mt-10"
          >
            <Composer autoFocus {...composer} />
          </motion.div>

          <motion.p
            data-motion-effect=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.6 }}
            className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted"
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Lock className="size-3" />
              Encrypted in your browser
            </span>
            {libraryNote && (
              <span className="whitespace-nowrap">
                <span aria-hidden="true">· </span>
                {libraryNote}
              </span>
            )}
          </motion.p>
        </div>
      </div>
    </div>
  );
}
