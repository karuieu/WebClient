"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Incognito, Lock } from "@/components/kit/icons";
import { Tooltip } from "@/components/kit/Tooltip";
import { cx } from "@/lib/cx";
import { Composer } from "./Composer";
import { pickGreeting, pickIncognitoGreeting, type Greeting, type IncognitoGreeting } from "./greeting";

const spring = { type: "spring", bounce: 0, duration: 1 } as const;

export function NewChatView({
  name,
  returning,
  greeting,
  incognitoGreeting,
  incognito,
  composer,
}: {
  name: string | null;
  returning?: boolean;
  greeting?: Greeting;
  incognitoGreeting?: IncognitoGreeting;
  incognito?: { on: boolean; onToggle: () => void };
  composer: React.ComponentProps<typeof Composer>;
}) {
  const reduce = useReducedMotion();
  const [picked, setPicked] = React.useState<Greeting | null>(null);
  const [pickedIncognito, setPickedIncognito] = React.useState<IncognitoGreeting | null>(null);
  const hidden = !!incognito?.on;

  React.useEffect(() => {
    if (!greeting) setPicked(pickGreeting({ returning }));
  }, [greeting, returning]);

  React.useEffect(() => {
    if (hidden && !incognitoGreeting) setPickedIncognito(pickIncognitoGreeting());
  }, [hidden, incognitoGreeting]);

  const g = greeting ?? picked;
  const lines = hidden
    ? (incognitoGreeting ?? pickedIncognito)
    : !name
      ? ["What's your name,", "stranger?"]
      : g
        ? [`${g.lead},`, `${name}${g.end}`]
        : null;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-[12vh] pt-16 sm:px-6">
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
                "flex h-9 cursor-pointer items-center gap-2 rounded-full px-2.5 text-[13px] tracking-[-0.01em] transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.96]",
                incognito.on ? "bg-surface-2 pr-3.5 text-fg ring-1 ring-inset ring-line-strong" : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <Incognito className="size-[18px]" />
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
                    Incognito
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
                className={i === 0 ? "block" : "block text-muted"}
                initial={reduce ? { opacity: 0 } : { y: "105%" }}
                animate={reduce ? { opacity: 1 } : { y: "0%" }}
                transition={reduce ? { duration: 0.3 } : { ...spring, delay: 0.05 + i * 0.09 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0.3 } : { ...spring, duration: 0.9, delay: 0.25 }}
          className="mt-10"
        >
          <Composer autoFocus {...composer} />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: reduce ? 0 : 0.6 }}
          className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] text-muted"
        >
          {hidden ? (
            <>
              <Incognito className="size-3" />
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
