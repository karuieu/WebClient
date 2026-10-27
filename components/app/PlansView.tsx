"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LANDING_URL } from "@/app/siteUrl";
import { Button } from "@/components/kit/Button";
import { Checkbox } from "@/components/kit/Field";
import { Enter, cascade } from "@/components/kit/Enter";
import { Label } from "@/components/kit/Frame";
import { Check } from "@/components/kit/icons";
import { Spinner } from "@/components/kit/Spinner";
import { cx } from "@/lib/ui/cx";

export type PlanCard = {
  tier: "free" | "pro";
  name: string;
  price: string;
  period: string;
  line: string;
  note: string;
  features: string[];
};

export type PlansViewProps = {
  plans: PlanCard[];
  current: "free" | "pro";
  loadingTier?: string | null;
  checkout?: "confirming" | "pending" | "done" | null;
  settingsHref: string;
  onChoose: (tier: "free" | "pro") => void;
  /** Buying Pro asks for it to start at once, so a withdrawal costs the days used (Terms 7.3). */
  startNow: boolean;
  startNowError?: string | null;
  onStartNow: (checked: boolean) => void;
};

export function PlansView({
  plans,
  current,
  loadingTier,
  checkout,
  settingsHref,
  onChoose,
  startNow,
  startNowError,
  onStartNow,
}: PlansViewProps) {
  const reduce = useReducedMotion();

  return (
    <div className="mx-auto w-full max-w-[60rem] px-4 pb-24 pt-16 sm:px-6 md:pt-20">
      <Enter>
        <div className="max-w-[36rem]">
          <Label>Plans</Label>
          <h1 className="text-title mt-4 text-balance">More room when you need it.</h1>
          <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
            Every plan is end-to-end encrypted, on every model. Upgrade or cancel anytime.
          </p>
        </div>
      </Enter>

      <AnimatePresence>
        {checkout && (
          <motion.div
            key="checkout"
            data-motion-effect=""
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.4 }}
            role="status"
            className="mt-8 flex items-center gap-3 rounded-2xl border border-line-strong bg-surface px-5 py-4 text-[14px]"
          >
            {checkout === "confirming" ? (
              <>
                <Spinner className="size-3.5" />
                <span className="text-muted">Confirming your payment with Polar…</span>
              </>
            ) : checkout === "pending" ? (
              <span className="text-muted">
                <span className="font-medium text-fg">Payment received.</span> Your plan switches to Pro as soon as Polar confirms it. This usually takes a minute.
              </span>
            ) : (
              <>
                <span className="grid size-5 place-items-center rounded-full bg-ok text-white">
                  <Check className="size-3" />
                </span>
                <span>
                  <span className="font-medium">Welcome to Pro.</span> <span className="text-muted">Everything is unlocked.</span>
                </span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {plans.map((p, index) => {
          const isCurrent = p.tier === current;
          const pro = p.tier === "pro";
          const downgrade = current === "pro" && p.tier === "free";
          return (
            <Enter key={p.tier} delay={cascade(index)}>
              <section
                className={cx(
                  "relative flex flex-col rounded-3xl p-7",
                  pro ? "bg-inverse text-on-inverse shadow-soft" : "border border-line bg-elevated",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-heading">{p.name}</h2>
                  {isCurrent && (
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                        pro ? "border border-on-inverse/30" : "border border-line-strong text-muted",
                      )}
                    >
                      Your plan
                    </span>
                  )}
                </div>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="text-[3rem] font-medium leading-none tracking-[-0.045em]">{p.price}</span>
                  <span className={cx("font-mono text-[12px]", pro ? "opacity-60" : "text-muted")}>{p.period}</span>
                </p>
                <p className={cx("mt-4 text-pretty text-[14.5px] leading-relaxed", pro ? "opacity-75" : "text-muted")}>{p.line}</p>
                <p className={cx("mt-3 font-mono text-[11.5px] leading-relaxed", pro ? "opacity-60" : "text-muted")}>{p.note}</p>

                <ul className={cx("mt-7 flex flex-col gap-3 border-t pt-6", pro ? "border-on-inverse/15" : "border-line")}>
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-[14.5px]">
                      <Check className={cx("mt-0.5 size-4", pro ? "opacity-70" : "text-muted")} />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  {isCurrent ? (
                    <p className={cx("flex h-12 items-center justify-center rounded-full text-[14px]", pro ? "border border-on-inverse/20 opacity-70" : "border border-line text-muted")}>
                      Your current plan
                    </p>
                  ) : downgrade ? (
                    <Link
                      href={settingsHref}
                      className="flex h-12 items-center justify-center rounded-full text-[14px] text-muted ring-1 ring-inset ring-line-strong transition-colors duration-150 hover:bg-surface hover:text-fg"
                    >
                      Manage in Settings
                    </Link>
                  ) : (
                    <Button
                      size="lg"
                      arrow
                      variant={pro ? "onInverse" : "primary"}
                      loading={loadingTier === p.tier}
                      onClick={() => onChoose(p.tier)}
                      className="w-full"
                    >
                      Upgrade to {p.name}
                    </Button>
                  )}
                </div>
              </section>
            </Enter>
          );
        })}
      </div>

      {current === "free" && (
        <Enter delay={200} blur={false}>
          <div className="mt-6 flex flex-col gap-2 px-1">
            <Checkbox
              id="start-now"
              checked={startNow}
              aria-invalid={startNowError ? true : undefined}
              aria-describedby={startNowError ? "start-now-error" : undefined}
              onChange={(e) => onStartNow(e.target.checked)}
            >
              I want Pro to start right away and understand that if I withdraw within 14 days, I pay for the days I had it (see the{" "}
              <Link href={`${LANDING_URL}/terms`} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-4">
                Terms
              </Link>
              ).
            </Checkbox>
            {startNowError && (
              <p id="start-now-error" role="alert" className="pl-[30px] text-[0.8125rem] text-danger">
                {startNowError}
              </p>
            )}
          </div>
        </Enter>
      )}

      <Enter delay={240} blur={false}>
        <p className="mt-6 px-1 font-mono text-[11px] leading-relaxed text-muted">
          Payments are handled by Polar. Karui never sees your card details. Cancel anytime in Settings → Billing; you keep Pro until the end of the period.
        </p>
      </Enter>
    </div>
  );
}
