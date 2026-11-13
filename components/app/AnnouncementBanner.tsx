"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, ButtonLink } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { ArrowUpRight, X } from "@/components/kit/icons";
import { Sheet } from "@/components/kit/Sheet";
import { useMediaQuery } from "@/components/kit/useMounted";

export type Announcement = { title: string; message: string; link?: { label: string; url: string } };

export function AnnouncementBanner({ announcement, open, onDismiss }: { announcement: Announcement; open: boolean; onDismiss: () => void }) {
  const phone = useMediaQuery("(max-width: 639px)");
  const [reading, setReading] = React.useState(false);

  const dismiss = (): void => {
    setReading(false);
    onDismiss();
  };

  const link = announcement.link && (
    <ButtonLink href={announcement.link.url} target="_blank" rel="noopener noreferrer" size="lg" variant="secondary">
      {announcement.link.label}
      <ArrowUpRight className="size-4" />
    </ButtonLink>
  );
  const gotIt = (
    <Button size="lg" onClick={dismiss}>
      Got it
    </Button>
  );

  return (
    <>
      <AnimatePresence>{open && <AnnouncementPill title={announcement.title} onRead={() => setReading(true)} onDismiss={dismiss} />}</AnimatePresence>
      <Dialog open={open && reading && !phone} onClose={() => setReading(false)} title={announcement.title} footer={<>{link}{gotIt}</>}>
        <p className={MESSAGE}>{announcement.message}</p>
      </Dialog>
      {/* A phone has no room for the pill, so the notice opens by itself and has to be closed first. */}
      <Sheet open={open && phone} onClose={dismiss} title={announcement.title}>
        <div className="flex flex-col gap-2 px-6 pb-2 pt-1">
          <p className={`${MESSAGE} mb-5`}>{announcement.message}</p>
          {gotIt}
          {link}
        </div>
      </Sheet>
    </>
  );
}

const MESSAGE = "max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-relaxed text-muted";

// Floats over the screen so incognito and the chat header stay put; one line, so it covers almost nothing.
function AnnouncementPill({ title, onRead, onDismiss }: { title: string; onRead: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      data-motion-effect=""
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
      className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-14 pt-3 max-sm:hidden md:top-0"
    >
      <aside
        aria-label="Announcement"
        className="pointer-events-auto flex h-10 min-w-0 max-w-[34rem] items-center rounded-full border border-line-strong bg-elevated pl-4 pr-1 text-[13.5px] shadow-soft"
      >
        <button type="button" onClick={onRead} className="group flex h-full min-w-0 cursor-pointer items-center gap-3 rounded-full pr-2">
          <span className="truncate font-medium">{title}</span>
          <span className="shrink-0 text-muted underline-offset-4 transition-colors duration-150 group-hover:text-fg group-hover:underline">Read</span>
        </button>
        <button
          type="button"
          aria-label="Dismiss announcement"
          onClick={onDismiss}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.94]"
        >
          <X className="size-4" />
        </button>
      </aside>
    </motion.div>
  );
}
