"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Checkbox } from "@/components/kit/Field";
import { AlertCircle, Lock } from "@/components/kit/icons";
import { RecoveryPhrase } from "@/components/kit/RecoveryPhrase";
import { cx } from "@/lib/ui/cx";

export type WelcomeStep = "phrase" | "memory";

/**
 * Shown once, on the first visit to /new. The phrase step only exists while the
 * browser still holds the phrase made at sign-in; the memory step always does.
 */
export function WelcomeDialog({
  open,
  step,
  words,
  memory,
  onMemory,
  saving,
  error,
  onSavePhrase,
  onSkipPhrase,
  onFinish,
}: {
  open: boolean;
  step: WelcomeStep;
  words: string[] | null;
  memory: boolean;
  onMemory: (on: boolean) => void;
  saving?: boolean;
  error?: string | null;
  onSavePhrase: () => void;
  onSkipPhrase: () => void;
  onFinish: () => void;
}) {
  const [saved, setSaved] = React.useState(false);
  const twoSteps = !!words;
  const counter = (n: number) =>
    twoSteps && <span className="self-center font-mono text-[11px] text-muted sm:mr-auto">{n} / 2</span>;

  if (step === "phrase" && words) {
    return (
      <Dialog
        open={open}
        onClose={() => saved && !saving && onSavePhrase()}
        title="Save your recovery phrase"
        description="These 12 words reset your password without losing your chats. Skip it and you can make one later in Settings."
        footer={
          <>
            {counter(1)}
            <Button variant="secondary" onClick={onSkipPhrase} disabled={saving}>
              Later
            </Button>
            <Button onClick={onSavePhrase} disabled={!saved} loading={saving}>
              Continue
            </Button>
          </>
        }
      >
        {/* Focus starts here, not on the blurred words, so nothing looks selected on open. */}
        <div tabIndex={-1} data-autofocus data-focus="within">
          <RecoveryPhrase words={words} />
        </div>
        <Checkbox id="welcome-recovery-saved" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-5">
          <span className="text-fg">I&apos;ve saved my recovery phrase somewhere safe</span>
        </Checkbox>
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
            <AlertCircle className="mt-px size-3.5" />
            {error}
          </p>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onFinish}
      title="Should Karui remember you?"
      description="What matters carries over from one chat to the next, so you don't repeat yourself."
      footer={
        <>
          {counter(2)}
          <Button onClick={onFinish}>Start chatting</Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Memory" tabIndex={-1} data-autofocus data-focus="within" className="flex flex-col gap-2.5">
        <MemoryChoice
          active={memory}
          onSelect={() => onMemory(true)}
          title="Yes, remember what matters"
          description="You can read, edit and delete everything it keeps in Workspace."
        />
        <MemoryChoice
          active={!memory}
          onSelect={() => onMemory(false)}
          title="Not now"
          description="Every chat starts fresh. You can turn it on in Settings."
        />
      </div>
      <p className="mt-4 flex items-center gap-2 pl-1 text-[12.5px] text-muted">
        <Lock className="size-3 shrink-0" />
        Encrypted, read only inside the enclave.
      </p>
    </Dialog>
  );
}

function MemoryChoice({
  active,
  onSelect,
  title,
  description,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cx(
        "flex w-full cursor-pointer items-start gap-4 rounded-2xl border bg-surface p-4 text-left transition-[border-color,box-shadow] duration-200",
        active ? "border-fg/50 shadow-soft" : "border-line hover:border-line-strong",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium tracking-[-0.015em]">{title}</span>
        <span className="mt-1 block text-pretty text-[13px] leading-relaxed text-muted">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-150",
          active ? "border-inverse bg-inverse" : "border-line-strong",
        )}
      >
        <motion.span
          initial={false}
          animate={{ scale: active ? 1 : 0 }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
          className="size-2 rounded-full bg-on-inverse"
        />
      </span>
    </button>
  );
}
