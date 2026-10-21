"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Incognito, Lock, incognitoCostumes, type Costume } from "@/components/kit/icons";
import { Tooltip } from "@/components/kit/Tooltip";
import { cx } from "@/lib/cx";
import { Composer } from "./Composer";
import { HalloweenBats } from "./HalloweenBats";
import { pickGreeting, pickIncognitoGreeting, type Greeting, type IncognitoGreeting } from "./greeting";

const spring = { type: "spring", bounce: 0, duration: 1 } as const;

export function NewChatView({
  name,
  returning,
  greeting,
  incognitoGreeting,
  incognito,
  halloween,
  composer,
}: {
  name: string | null;
  returning?: boolean;
  greeting?: Greeting;
  incognitoGreeting?: IncognitoGreeting;
  incognito?: { on: boolean; onToggle: () => void };
  /** The Halloween event and the costume incognito wears for it: a plain new chat only gets other greetings. */
  halloween?: Costume;
  composer: React.ComponentProps<typeof Composer>;
}) {
  const reduce = useReducedMotion();
  const [picked, setPicked] = React.useState<Greeting | null>(null);
  const [pickedIncognito, setPickedIncognito] = React.useState<IncognitoGreeting | null>(null);
  const hidden = !!incognito?.on;

  React.useEffect(() => {
    if (!greeting) setPicked(pickGreeting({ returning, halloween: !!halloween }));
  }, [greeting, returning, halloween]);

  React.useEffect(() => {
    if (hidden && !incognitoGreeting) setPickedIncognito(pickIncognitoGreeting({ halloween: !!halloween }));
  }, [hidden, incognitoGreeting, halloween]);

  const g = greeting ?? picked;
  const lines = hidden
    ? (incognitoGreeting ?? pickedIncognito)
    : !name
      ? ["What's your name,", "stranger?"]
      : g
        ? [`${g.lead},`, `${name}${g.end}`]
        : null;
  const spooky = hidden && !!halloween;
  const IncognitoIcon = halloween ? incognitoCostumes[halloween] : Incognito;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-[12vh] pt-16 sm:px-6">
      {spooky && !reduce && <HalloweenBats />}
      {incognito && (
        <div className="absolute right-3 top-3 md:right-4 md:top-4">
          <Tooltip
            label={incognito.on ? undefined : "Incognito chat"}
            keys={incognito.on ? undefined : ["Mod", "Shift", "I"]}
            align="end"
          >
            <button
              type="button"
              onClick={incognito.onToggle}
              aria-pressed={incognito.on}
              aria-label="Incognito chat"
              className={cx(
                "flex h-9 cursor-pointer items-center rounded-full px-2.5 text-[13px] tracking-[-0.01em] transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.96]",
                incognito.on
                  ? cx("ring-1 ring-inset", halloween ? "bg-halloween/8 text-halloween ring-halloween/40" : "bg-surface-2 text-fg ring-line-strong")
                  : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <IncognitoIcon className="size-[18px]" />
              <AnimatePresence initial={false}>
                {incognito.on && (
                  <motion.span
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    className="overflow-hidden whitespace-nowrap"
                    aria-hidden="true"
                  >
                    {/* The gap collapses with the label, so the pill has nothing left to snap when it unmounts. */}
                    <span className="block pl-2">Incognito</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </Tooltip>
        </div>
      )}

      <div className="w-full max-w-[44rem]">
        <h1 className="text-title min-h-[2.08em] px-1">
          {lines?.map((line, i) => (
            <span key={`${line}-${i}`} className="block overflow-hidden pb-[0.08em]">
              <motion.span
                data-motion-effect=""
                className={i === 0 ? "block" : cx("block", spooky ? "text-halloween" : "text-muted")}
                initial={{ y: "105%" }}
                animate={{ y: "0%" }}
                transition={reduce ? { duration: 0 } : { ...spring, delay: 0.05 + i * 0.09 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          data-motion-effect=""
          initial={{ opacity: 0, y: 24, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0 } : { ...spring, duration: 0.9, delay: 0.25 }}
          className="mt-10"
        >
          <Composer autoFocus {...composer} />
        </motion.div>

        <motion.p
          data-motion-effect=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.6 }}
          className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] text-muted"
        >
          {hidden ? (
            <>
              <IncognitoIcon className={cx("size-3", spooky && "text-halloween")} />
              Not saved · no memory · gone when you leave
            </>
          ) : (
            <>
              <Lock className="size-3" />
              Encrypted in your browser
            </>
          )}
        </motion.p>
      </div>
    </div>
  );
}
