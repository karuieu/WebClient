"use client";

import * as React from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/kit/Button";
import { Checkbox } from "@/components/kit/Field";
import { CipherField } from "@/components/kit/CipherField";
import { Enter } from "@/components/kit/Enter";
import { Tilt } from "@/components/motion";
import { ArrowLeft, ArrowRight, Check } from "@/components/kit/icons";
import { Logo } from "@/components/kit/Logo";
import { Spinner } from "@/components/kit/Spinner";

export type UpgradeViewProps = {
  price: string;
  period: string;
  current: "free" | "pro";
  loading?: boolean;
  checkout?: "confirming" | "pending" | "done" | null;
  plansHref: string;
  termsHref: string;
  settingsHref: string;
  homeHref: string;
  onContinue: () => void;
  /** Buying Pro asks for it to start at once, so a withdrawal costs the days used (Terms 7.3). */
  startNow: boolean;
  startNowError?: string | null;
  onStartNow: (checked: boolean) => void;
};

// A band of light crosses the button once on hover.
const CONTINUE_SWEEP =
  "w-full overflow-hidden hover:opacity-100 " +
  "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-1/3 before:-translate-x-[130%] before:-skew-x-12 before:bg-gradient-to-r before:from-transparent before:via-bg/25 before:to-transparent before:content-[''] " +
  "hover:before:translate-x-[330%] hover:before:transition-transform hover:before:duration-700 hover:before:ease-out motion-reduce:before:hidden";

const external = { target: "_blank", rel: "noopener noreferrer" };

export function UpgradeView({
  price,
  period,
  current,
  loading,
  checkout,
  plansHref,
  termsHref,
  settingsHref,
  homeHref,
  onContinue,
  startNow,
  startNowError,
  onStartNow,
}: UpgradeViewProps) {
  const pro = current === "pro";
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-14 text-fg sm:px-6">
      <CipherField className="absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,transparent_45%,black_100%)]" />
      <div className="relative w-full max-w-[26rem]">
        <Enter>
          <div>
            <div className="flex min-h-11 items-center justify-between px-1">
              <Logo />
              {!pro && (
                <Link href={homeHref} className="-mr-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[14px] text-muted transition-colors duration-150 hover:text-fg">
                  <ArrowLeft className="size-4" />
                  Back to chat
                </Link>
              )}
            </div>
            <Tilt maxTilt={8} transition={{ stiffness: 170, damping: 16, mass: 0.7 }} className="mt-4">
              <section className="cursor-default select-none rounded-3xl bg-inverse p-7 text-on-inverse shadow-soft [transform-style:preserve-3d]">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-heading">Karui Pro</h1>
                  {pro && (
                    <span className="grid size-6 place-items-center rounded-full bg-on-inverse text-inverse">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>
                {pro ? (
                  <div role="status" className="mt-8 [transform:translateZ(28px)]">
                    <p className="text-balance text-[2.5rem] font-medium leading-[1.05] tracking-[-0.04em]">{checkout === "done" ? "Welcome to Pro." : "You're on Pro."}</p>
                    {checkout !== "done" && (
                      <p className="mt-3 font-mono text-[12px] opacity-70">
                        {price} {period}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-8 flex items-baseline gap-2 [transform:translateZ(28px)]">
                    <span className="text-[3.5rem] font-medium leading-none tracking-[-0.05em]">{price}</span>
                    <span className="font-mono text-[12px] opacity-70">{period}</span>
                  </p>
                )}
                <div className="mt-8 border-t border-on-inverse/15 pt-3">
                  <Link
                    href={pro ? settingsHref : plansHref}
                    {...(pro ? {} : external)}
                    className="group -mx-3 flex h-11 items-center justify-between rounded-xl px-3 text-[14px] transition-colors duration-150 hover:bg-on-inverse/10 focus-visible:bg-on-inverse/10"
                  >
                    {pro ? "Manage billing" : "See the full plan"}
                    <ArrowRight className="size-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </section>
            </Tilt>
          </div>
        </Enter>

        <Enter delay={120} blur={false}>
          <div className="mt-8">
            {checkout === "confirming" ? (
              <p role="status" className="flex items-center gap-3 text-[14px] text-muted">
                <Spinner className="size-3.5" />
                Confirming your payment with Polar…
              </p>
            ) : checkout === "pending" ? (
              <p role="status" className="text-[14px] leading-relaxed text-muted">
                <span className="font-medium text-fg">Payment received.</span> Your plan switches to Pro as soon as Polar confirms it. This usually takes a minute.
              </p>
            ) : pro ? (
              <ButtonLink href={homeHref} size="lg" arrow className="w-full">
                Start a chat
              </ButtonLink>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <Checkbox
                    id="start-now"
                    checked={startNow}
                    aria-invalid={startNowError ? true : undefined}
                    aria-describedby={startNowError ? "start-now-error" : undefined}
                    onChange={(e) => onStartNow(e.target.checked)}
                  >
                    Start Pro right away. If I withdraw within 14 days, I pay only for the days I had it.{" "}
                    <Link href={termsHref} {...external} className="text-fg underline underline-offset-4">
                      Terms
                    </Link>
                  </Checkbox>
                </div>
                <Button size="lg" arrow loading={loading} onClick={onContinue} className={CONTINUE_SWEEP}>
                  Continue to payment
                </Button>
                {startNowError && (
                  <p id="start-now-error" role="alert" className="-mt-2 text-center text-[0.8125rem] text-danger">
                    {startNowError}
                  </p>
                )}
              </div>
            )}
          </div>
        </Enter>
      </div>
    </main>
  );
}
