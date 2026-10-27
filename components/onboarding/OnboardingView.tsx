"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { LANDING_URL } from "@/app/siteUrl";
import { Checkbox } from "@/components/kit/Field";
import { RecoveryPhrase } from "@/components/kit/RecoveryPhrase";
import { Lock } from "@/components/kit/icons";
import { InfoHint } from "@/components/kit/InfoHint";
import { BigInput, ChoiceCards, OnboardingShell } from "./OnboardingShell";

export type OnboardingValues = {
  displayName: string;
  fullName: string;
  provider: string;
  autoWebSearch: boolean;
  memory: boolean;
  recoverySaved: boolean;
  plan: "free" | "pro";
  /** Buying Pro asks for it to start at once, so a withdrawal costs the days used (Terms 7.3). */
  startNow: boolean;
};

export type OnboardingViewProps = {
  step: number;
  direction: 1 | -1;
  values: OnboardingValues;
  onChange: (patch: Partial<OnboardingValues>) => void;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  saving?: boolean;
  error?: string | null;
  nameMax: number;
  providers: { id: string; name: string; model: string }[];
  plans: { tier: "free" | "pro"; name: string; price: string; limits: string; highlight: string }[];
  recoveryPhrase: string[] | null;
};

export const ONBOARDING_STEPS = 7;

export function onboardingSteps(withRecovery: boolean): number {
  return withRecovery ? ONBOARDING_STEPS : ONBOARDING_STEPS - 1;
}

export function OnboardingView(p: OnboardingViewProps) {
  const { step, values: v } = p;
  const total = onboardingSteps(!!p.recoveryPhrase);
  const last = step === total;
  const common = {
    step,
    total,
    direction: p.direction,
    saving: p.saving,
    error: p.error,
    onBack: step > 1 ? p.onBack : undefined,
    onNext: last ? p.onFinish : p.onNext,
  };

  const plan = () => (
    <OnboardingShell
      {...common}
      label="Plan"
      title="Start free, or go Pro?"
      lead="You can change this anytime."
      continueLabel={v.plan === "pro" ? "Continue to payment" : "Start chatting"}
      canContinue={v.plan !== "pro" || v.startNow}
    >
      <ChoiceCards
        label="Plan"
        value={v.plan}
        onChange={(t) => p.onChange({ plan: t })}
        options={p.plans.map((pl) => ({
          value: pl.tier,
          title: `${pl.name} · ${pl.price}`,
          meta: pl.highlight,
          description: pl.limits,
        }))}
      />
      {v.plan === "pro" && (
        <>
          <Checkbox
            id="onboarding-start-now"
            checked={v.startNow}
            onChange={(e) => p.onChange({ startNow: e.target.checked })}
            className="mt-5"
          >
            I want Pro to start right away and understand that if I withdraw within 14 days, I pay for the days I had it (see the{" "}
            <Link href={`${LANDING_URL}/terms`} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-4">
              Terms
            </Link>
            ).
          </Checkbox>
          <p className="mt-4 pl-1 text-[12.5px] leading-relaxed text-muted">
            Payments are handled by Polar. Karui never sees your card details.
          </p>
        </>
      )}
    </OnboardingShell>
  );

  switch (step) {
    case 1:
      return (
        <OnboardingShell
          {...common}
          label="You"
          title="What should Karui call you?"
          lead="A first name or a nickname. It's how you'll be greeted."
          canContinue={v.displayName.trim().length > 0}
        >
          <BigInput
            id="onboarding-name"
            label="Your name"
            autoFocus
            autoComplete="given-name"
            maxLength={p.nameMax}
            placeholder="Your name"
            value={v.displayName}
            onChange={(e) => p.onChange({ displayName: e.target.value })}
          />
          <div className="mt-4 h-6 pl-1">
            <AnimatePresence>
              {v.displayName.trim() && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  className="font-mono text-[12px] text-muted"
                >
                  “How are you, {v.displayName.trim()}?”
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </OnboardingShell>
      );
    case 2:
      return (
        <OnboardingShell
          {...common}
          label="Full name"
          title="And your full name?"
          lead="Only if you'd like. It's used where a full name makes sense, never to greet you."
          skipLabel="Skip"
          onSkip={() => {
            p.onChange({ fullName: "" });
            p.onNext();
          }}
        >
          <BigInput
            id="onboarding-full-name"
            label="Full name"
            autoFocus
            autoComplete="name"
            maxLength={p.nameMax}
            placeholder="First and last name"
            value={v.fullName}
            onChange={(e) => p.onChange({ fullName: e.target.value })}
          />
        </OnboardingShell>
      );
    case 3:
      return (
        <OnboardingShell
          {...common}
          label="Helper model"
          title="Which provider?"
          titleHint={
            <InfoHint label="About the helper model">
              Only memory updates and conversation summaries use this provider. Your chat model keeps its own provider.
            </InfoHint>
          }
        >
          <ChoiceCards
            label="Helper model provider"
            value={v.provider}
            onChange={(id) => p.onChange({ provider: id })}
            options={p.providers.map((o) => ({
              value: o.id,
              title: o.name,
              meta: `${o.model} · hardware verified in your browser`,
            }))}
          />
        </OnboardingShell>
      );
    case 4:
      return (
        <OnboardingShell
          {...common}
          label="Web search"
          title="Look things up when it helps?"
          lead="For questions that need fresh facts. You can switch it per chat, too."
        >
          <ChoiceCards
            label="Web search"
            value={v.autoWebSearch ? "auto" : "manual"}
            onChange={(x) => p.onChange({ autoWebSearch: x === "auto" })}
            options={[
              {
                value: "auto",
                title: "Automatically",
                description: "Karui decides when a search or a web page would help. Only the search query and the page address are sent out, never your conversation.",
              },
              { value: "manual", title: "Only when I ask", description: "Search stays off until you turn it on in a chat." },
            ]}
          />
        </OnboardingShell>
      );
    case 5:
      return (
        <OnboardingShell
          {...common}
          label="Memory"
          title="Should Karui remember you?"
          lead="What matters carries over from one chat to the next, so you don't repeat yourself."
        >
          <ChoiceCards
            label="Memory"
            value={v.memory ? "on" : "off"}
            onChange={(x) => p.onChange({ memory: x === "on" })}
            options={[
              {
                value: "on",
                title: "Yes, remember what matters",
                description: "You can read, edit and delete everything it keeps in Settings.",
              },
              { value: "off", title: "Not now", description: "Every chat starts fresh. You can turn memory on later." },
            ]}
          />
          <p className="mt-5 flex items-start gap-2 pl-1 text-[12.5px] leading-relaxed text-muted">
            <Lock className="mt-0.5 size-3 shrink-0" />
            Memory is encrypted in your browser. It&apos;s only read inside the enclave, when a chat needs it.
          </p>
        </OnboardingShell>
      );
    case 6:
      if (!p.recoveryPhrase) return plan();
      return (
        <OnboardingShell
          {...common}
          label="Recovery"
          title="Save your recovery phrase."
          lead="If you ever forget your password, these 12 words get your chats back. We can't, because we never have your key."
          canContinue={v.recoverySaved}
        >
          <RecoveryPhrase words={p.recoveryPhrase} />
          <Checkbox
            id="onboarding-recovery-saved"
            checked={v.recoverySaved}
            onChange={(e) => p.onChange({ recoverySaved: e.target.checked })}
            className="mt-5"
          >
            <span className="text-fg">I&apos;ve saved my recovery phrase somewhere safe</span>
            <span className="block text-[12.5px]">Offline is best: paper, or a password manager.</span>
          </Checkbox>
        </OnboardingShell>
      );
    default:
      return plan();
  }
}
