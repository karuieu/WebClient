"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelLeft, Plus } from "@/components/kit/icons";
import { LogoMark } from "@/components/kit/Logo";
import { Tooltip } from "@/components/kit/Tooltip";
import { Sidebar, type SidebarProps } from "./Sidebar";

const HIDDEN_KEY = "karui-sidebar-hidden";

export const ShellContext = React.createContext({ sidebarHidden: false });
const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

function usePeek() {
  const [peek, setPeek] = React.useState(false);
  const over = React.useRef(false);
  const menus = React.useRef(0);
  const armed = React.useRef(true);
  const panel = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const open = React.useCallback(() => {
    clearTimeout(timer.current);
    setPeek(true);
  }, []);

  const scheduleClose = React.useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const editing = panel.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT";
      if (!over.current && menus.current === 0 && !editing) setPeek(false);
    }, 200);
  }, []);

  const close = React.useCallback(() => {
    clearTimeout(timer.current);
    menus.current = 0;
    setPeek(false);
  }, []);

  // Right after hiding, the cursor sits exactly where the show button appears; ignore it until it leaves.
  const disarm = React.useCallback(() => {
    armed.current = false;
  }, []);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return {
    peek,
    panel,
    open,
    close,
    disarm,
    triggerProps: {
      onPointerEnter: () => {
        over.current = true;
        if (armed.current) open();
      },
      onPointerLeave: () => {
        over.current = false;
        armed.current = true;
        scheduleClose();
      },
    },
    hoverProps: {
      onPointerEnter: () => {
        over.current = true;
        open();
      },
      onPointerLeave: () => {
        over.current = false;
        scheduleClose();
      },
    },
    onMenuOpenChange: (o: boolean) => {
      menus.current = Math.max(0, menus.current + (o ? 1 : -1));
      if (!o) scheduleClose();
    },
  };
}

export function AppShell({ sidebar, children }: { sidebar: SidebarProps; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [hidden, setHidden] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const peek = usePeek();

  React.useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    const onResize = () => window.innerWidth >= 768 && setDrawer(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [drawer]);

  const setHiddenPersist = (h: boolean) => {
    setHidden(h);
    peek.close();
    if (h) peek.disarm();
    try {
      localStorage.setItem(HIDDEN_KEY, h ? "1" : "0");
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

      <AnimatePresence initial={false}>
        {!hidden && (
          <motion.div
            key="docked"
            initial={{ width: 0 }}
            animate={{ width: 280 }}
            exit={{ width: 0 }}
            transition={reduce ? { duration: 0 } : spring}
            className="hidden shrink-0 overflow-hidden md:flex"
          >
            <Sidebar {...sidebar} variant="docked" onHeaderAction={() => setHiddenPersist(true)} />
          </motion.div>
        )}
      </AnimatePresence>

      {hidden && (
        <>
          <div aria-hidden="true" className="fixed inset-y-0 left-0 z-30 hidden w-2 md:block" {...peek.triggerProps} />
          <button
            type="button"
            aria-label="Show sidebar"
            title="Show sidebar"
            onClick={() => setHiddenPersist(false)}
            {...peek.triggerProps}
            className="fixed left-3 top-2.5 z-40 hidden size-9 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-fg active:scale-[0.94] md:grid"
          >
            <PanelLeft className="size-[18px]" />
          </button>

          <AnimatePresence>
            {peek.peek && (
              <motion.div
                key="peek"
                ref={peek.panel}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -10, transition: { duration: 0.16 } }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="fixed inset-y-0 left-0 z-50 hidden md:flex"
                {...peek.hoverProps}
              >
                <Sidebar
                  {...sidebar}
                  variant="peek"
                  onHeaderAction={() => setHiddenPersist(false)}
                  onNavigate={peek.close}
                  onMenuOpenChange={peek.onMenuOpenChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

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
                onHeaderAction={() => setDrawer(false)}
                onNavigate={() => setDrawer(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-2 md:hidden">
          <Tooltip label="Open sidebar" keys={["Mod", "B"]}>
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open sidebar"
              aria-expanded={drawer}
              className="grid size-10 cursor-pointer place-items-center rounded-full hover:bg-surface active:scale-[0.94]"
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
              className="grid size-10 place-items-center rounded-full hover:bg-surface active:scale-[0.94]"
            >
              <Plus className="size-[18px]" />
            </Link>
          </Tooltip>
        </header>

        <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable_both-edges]">
          <ShellContext.Provider value={{ sidebarHidden: hidden }}>{children}</ShellContext.Provider>
        </main>
      </div>
    </div>
  );
}
