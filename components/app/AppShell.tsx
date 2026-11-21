"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus } from "@/components/kit/icons";
import { LogoMark } from "@/components/kit/Logo";
import { ResizeHandle } from "@/components/kit/ResizeHandle";
import { Tooltip } from "@/components/kit/Tooltip";
import { PANEL_WIDTH, Sidebar, type SidebarProps } from "./Sidebar";

const HIDDEN_KEY = "karui-sidebar-hidden";
const WIDTH_KEY = "karui-sidebar-width";

const clampPanelWidth = (w: number) => Math.min(Math.max(w, PANEL_WIDTH.min), PANEL_WIDTH.max);

export function AppShell({ sidebar, banner, children }: { sidebar: SidebarProps; banner?: React.ReactNode; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [hidden, setHidden] = React.useState(false);
  const [panelWidth, setPanelWidth] = React.useState<number>(PANEL_WIDTH.default);
  const [resizing, setResizing] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
      const savedWidth = Number(localStorage.getItem(WIDTH_KEY));
      if (savedWidth) setPanelWidth(clampPanelWidth(savedWidth));
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!drawer) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key !== "Tab" || !drawerRef.current?.contains(e.target as Node)) return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const onResize = () => window.innerWidth >= 768 && setDrawer(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      previousFocus?.focus();
    };
  }, [drawer]);

  const setHiddenPersist = (h: boolean) => {
    setHidden(h);
    try {
      localStorage.setItem(HIDDEN_KEY, h ? "1" : "0");
    } catch {}
  };

  const commitPanelWidth = (w: number) => {
    setPanelWidth(w);
    try {
      localStorage.setItem(WIDTH_KEY, String(w));
    } catch {}
  };

  // Ctrl on Linux/Windows, Cmd on macOS. Comma is matched by e.code because Shift turns e.key into "<".
  // Ctrl+Shift+I only ever opens incognito: on /new?incognito a conversation may be under way, and leaving wipes it.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const run =
        e.shiftKey && key === "o"
          ? () => router.push("/new")
          : e.shiftKey && key === "i"
            ? () => router.push("/new?incognito")
            : e.shiftKey && e.code === "Comma"
              ? sidebar.onOpenSettings
              : !e.shiftKey && key === "b"
                ? () => (window.innerWidth >= 768 ? setHiddenPersist(!hidden) : setDrawer((d) => !d))
                : !e.shiftKey && key === "k"
                  ? sidebar.onOpenSearch
                  : null;
      if (!run) return;
      e.preventDefault();
      if (!e.repeat) run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-dvh bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-inverse focus:px-4 focus:py-2 focus:text-sm focus:text-on-inverse"
      >
        Skip to content
      </a>

      <div className="relative hidden shrink-0 md:flex">
        <Sidebar
          {...sidebar}
          variant="docked"
          panelOpen={!hidden}
          panelWidth={panelWidth}
          resizing={resizing}
          onHeaderAction={() => setHiddenPersist(!hidden)}
        />
        {!hidden && (
          <ResizeHandle
            label="Resize sidebar"
            edge="right"
            width={panelWidth}
            min={PANEL_WIDTH.min}
            max={PANEL_WIDTH.max}
            defaultWidth={PANEL_WIDTH.default}
            dragging={resizing}
            onDraggingChange={setResizing}
            onResize={setPanelWidth}
            onCommit={commitPanelWidth}
            className="-right-1"
          />
        )}
      </div>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
              aria-hidden="true"
            />
            <motion.div
              key="drawer"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Sidebar"
              initial={reduce ? { opacity: 0 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "-100%", transition: { type: "spring", bounce: 0, duration: 0.3 } }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed inset-y-0 left-0 z-50 flex shadow-soft md:hidden"
            >
              <Sidebar
                {...sidebar}
                variant="drawer"
                panelOpen
                panelWidth={PANEL_WIDTH.default}
                onHeaderAction={() => setDrawer(false)}
                onNavigate={() => setDrawer(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="relative flex min-w-0 flex-1 flex-col" inert={drawer}>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-2 md:hidden">
          <Tooltip label="Open sidebar" keys={["Mod", "B"]}>
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open sidebar"
              aria-expanded={drawer}
              className="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-surface active:scale-[0.94]"
            >
              <span className="relative block h-3 w-4" aria-hidden="true">
                <span className="absolute left-0 top-0 h-[1.5px] w-4 bg-fg" />
                <span className="absolute bottom-0 left-0 h-[1.5px] w-2.5 bg-fg" />
              </span>
            </button>
          </Tooltip>
          <LogoMark className="size-[22px]" />
          <Tooltip label="New chat" keys={["Mod", "Shift", "O"]} align="end">
            <Link
              href="/new"
              aria-label="New chat"
              className="grid size-11 place-items-center rounded-full hover:bg-surface active:scale-[0.94]"
            >
              <Plus className="size-[18px]" />
            </Link>
          </Tooltip>
        </header>

        {banner}
        {/* Keeps the scrollbar's space, so a short page (Connectors with few rows) doesn't shift sideways.
            Views that scroll their own container (data-own-scroll) would leave that space empty. */}
        <main
          id="main"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable] has-[[data-own-scroll]]:[scrollbar-gutter:auto]"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
