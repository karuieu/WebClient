"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { X } from "@/components/kit/icons";
import { Sheet } from "@/components/kit/Sheet";
import { useMediaQuery } from "@/components/kit/useMounted";
import { cx } from "@/lib/cx";
import { ShellContext } from "./AppShell";

export type Announcement = { title: string; message: string };

// Stays mounted after dismissal (open = false) so the card and the sheet can animate out with their text.
export function AnnouncementBanner({ announcement, open, onDismiss }: { announcement: Announcement; open: boolean; onDismiss: () => void }) {
  const phone = useMediaQuery("(max-width: 639px)");

  return (
    <>
      <Sheet open={open && phone} onClose={onDismiss} title={announcement.title}>
        <div className="px-6 pb-2 pt-1">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-muted">{announcement.message}</p>
          <Button size="lg" onClick={onDismiss} className="mt-7 w-full">
            Got it
          </Button>
        </div>
      </Sheet>
      <AnimatePresence>{open && !phone && <AnnouncementCard announcement={announcement} onDismiss={onDismiss} />}</AnimatePresence>
    </>
  );
}

function AnnouncementCard({ announcement, onDismiss }: { announcement: Announcement; onDismiss: () => void }) {
  const { sidebarHidden } = React.useContext(ShellContext);
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={reduce ? { duration: 0.2 } : { type: "spring", bounce: 0, duration: 0.5 }}
      className={cx("px-4 pt-3 sm:px-6", sidebarHidden && "md:px-14")}
    >
      <aside
        aria-label="Announcement"
        className="mx-auto flex max-w-[44rem] items-start gap-2 rounded-2xl border border-line bg-surface py-3 pl-4 pr-2 text-[13.5px] leading-relaxed"
      >
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium">{announcement.title}</p>
          <p className="mt-0.5 max-h-[30dvh] overflow-y-auto whitespace-pre-wrap break-words text-muted">{announcement.message}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss announcement"
          onClick={onDismiss}
          className="-mt-1.5 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94]"
        >
          <X className="size-4" />
        </button>
      </aside>
    </motion.div>
  );
}
