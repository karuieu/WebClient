"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { X } from "./icons";
import { useMounted } from "./useMounted";

export function Sheet({
  open,
  onClose,
  title,
  id,
  panelRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  id?: string;
  panelRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const drag = useDragControls();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] font-sans text-fg">
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%", transition: { type: "spring", bounce: 0, duration: 0.3 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.42 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose();
            }}
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[26px] border-t border-line bg-elevated shadow-soft"
          >
            <div className="shrink-0 cursor-grab touch-none px-4 pt-2.5" onPointerDown={(e) => drag.start(e)}>
              <span aria-hidden="true" className="mx-auto block h-1 w-9 rounded-full bg-line-strong" />
              <div className="mt-2 flex items-center justify-between pb-1 pl-2">
                <p className="text-heading">{title}</p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid size-9 cursor-pointer place-items-center rounded-full bg-surface text-muted transition-colors duration-150 hover:text-fg active:scale-[0.94]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
