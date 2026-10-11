"use client";

import { AnimatePresence, motion } from "motion/react";
import { Paperclip } from "@/components/kit/icons";

export function DropOverlay({ active, note, label = "Drop to attach" }: { active: boolean; note?: string; label?: string }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-[28px] border border-dashed border-line-strong bg-bg/85 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-12 place-items-center rounded-2xl border border-line bg-elevated shadow-soft">
              <Paperclip className="size-5" />
            </span>
            <p className="text-[15px] font-medium tracking-[-0.01em]">{label}</p>
            {note && <p className="font-mono text-[11px] text-muted">{note}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
