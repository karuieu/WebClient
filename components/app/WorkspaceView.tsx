"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Enter } from "@/components/kit/Enter";
import { Segmented } from "@/components/kit/Segmented";
import { PageActionsSlot } from "./PageActions";

export type WorkspaceTab = "skills" | "connectors" | "memory" | "instructions";

export const WORKSPACE_TABS: readonly { id: WorkspaceTab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "memory", label: "Memory" },
  { id: "instructions", label: "Instructions" },
];

export function WorkspaceView({
  title,
  tab,
  onTab,
  sections,
}: {
  title: string;
  tab: WorkspaceTab;
  onTab: (t: WorkspaceTab) => void;
  sections: Record<WorkspaceTab, React.ReactNode>;
}) {
  const reduce = useReducedMotion();
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const options = WORKSPACE_TABS.map((t) => ({ value: t.id, label: t.label }));

  return (
    <div className="mx-auto w-full max-w-[60rem] px-4 pb-24 pt-16 sm:px-6 md:pt-20">
      <Enter>
        <h1 className="text-title">{title}</h1>
      </Enter>

      <Enter delay={60}>
        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-4">
          {/* Four tabs don't fit a 320 px phone, so the strip scrolls on its own instead of the page. */}
          <div className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:px-0">
            <Segmented id="workspace-tabs" label={title} options={options} value={tab} onChange={onTab} className="w-max" />
          </div>
          <div ref={setSlot} className="ml-auto flex flex-wrap items-center gap-2 empty:hidden" />
        </div>
      </Enter>

      <PageActionsSlot value={slot}>
        <Enter delay={100} blur={false}>
          <div className="mt-10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              >
                {sections[tab]}
              </motion.div>
            </AnimatePresence>
          </div>
        </Enter>
      </PageActionsSlot>
    </div>
  );
}
