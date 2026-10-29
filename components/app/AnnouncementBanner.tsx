"use client";

import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { X } from "@/components/kit/icons";
import { Sheet } from "@/components/kit/Sheet";
import { useMediaQuery } from "@/components/kit/useMounted";

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

// Floats over the screen so incognito and the chat header stay put; the side padding keeps it clear of them.
function AnnouncementCard({ announcement, onDismiss }: { announcement: Announcement; onDismiss: () => void }) {
  return (
    <motion.div
      data-motion-effect=""
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
      className="pointer-events-none absolute inset-x-0 top-14 z-30 px-4 pt-3 sm:px-14 md:top-0"
    >
      <aside
        aria-label="Announcement"
        className="pointer-events-auto mx-auto flex max-w-[44rem] items-start gap-2 rounded-2xl border border-line bg-surface py-3 pl-4 pr-2 text-[13.5px] leading-relaxed"
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
