"use client";

import * as React from "react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { LANDING_URL } from "@/app/siteUrl";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Checkbox, Field } from "@/components/kit/Field";
import { Segmented } from "@/components/kit/Segmented";
import { ArrowUpRight } from "@/components/kit/icons";
import { Group, Row } from "./Layout";

export type UsageWindow = {
  label: string;
  used: number;
  limit: number;
  resetAt?: string | null;
};

/** Rates are USD nanos per token. */
export type RateRow = { key: string; name: string; meta: string; input: number; cachedInput: number; output: number };

export type RatesState = { state: "loading" } | { state: "error" } | { state: "ready"; rows: RateRow[] };

/** Whole US dollars. */
export type CreditRange = { min: number; max: number };

export type UsageSettingsProps = {
  plan: "free" | "pro";
  window: UsageWindow;
  renewalPending?: boolean;
  onUpgrade?: () => void;
  credits: number;
  creditAmounts: readonly number[];
  creditRange: CreditRange;
  onBuyCredits: (amountUSD: number) => void;
  buyingCredits?: boolean;
  rates: RatesState;
};

function countdown(to: string, now: number) {
  const diff = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${pad(m)}m` : `${pad(m)}m ${pad(s)}s`;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 9,
});

function formatUSD(nanos: number): string {
  return usd.format(nanos / 1_000_000_000);
}

const perMillion = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

function formatRate(nanosPerToken: number): string {
  return perMillion.format(nanosPerToken / 1000);
}

function UsageCard({ plan, window: w, renewalPending }: Pick<UsageSettingsProps, "plan" | "window" | "renewalPending">) {
  const reduce = useReducedMotion();
  const [now, setNow] = React.useState<number | null>(null);
  const pct = w.limit > 0 ? Math.min(100, Math.round((w.used / w.limit) * 100)) : 0;
  const high = pct >= 80;
  const spent = formatUSD(w.used);
  const limit = formatUSD(w.limit);

  React.useEffect(() => {
    if (!w.resetAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [w.resetAt]);

  return (
    <section className="rounded-2xl border border-line bg-elevated p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-label text-muted">{w.label}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{plan === "pro" ? "Pro" : "Free"}</p>
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-[2.75rem] font-medium leading-none tracking-[-0.04em] tabular-nums">{pct}%</span>
        <span className="text-[14px] text-muted">used</span>
      </p>
      <div
        role="meter"
        aria-label={`USD used, ${w.label.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${spent} of ${limit} USD`}
        className="mt-5 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", bounce: 0, duration: 0.9 }}
          className={high ? "h-full rounded-full bg-fg" : "h-full rounded-full bg-fg/45"}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[12px] text-muted tabular-nums">
        <span>
          {spent} / {limit} USD
        </span>
        {w.resetAt && now !== null && <span>Resets in {countdown(w.resetAt, now)}</span>}
      </div>
      {renewalPending && <p role="status" className="mt-3 text-[13px] text-muted">Your allowance resets when your subscription renews.</p>}
    </section>
  );
}

function BuyCreditsDialog({
  open,
  onClose,
  amounts,
  range,
  onBuy,
  buying,
}: {
  open: boolean;
  onClose: () => void;
  amounts: readonly number[];
  range: CreditRange;
  onBuy: (amountUSD: number) => void;
  buying?: boolean;
}) {
  const [input, setInput] = React.useState(String(amounts[1] ?? amounts[0]));
  const [consent, setConsent] = React.useState(false);
  const [consentMissing, setConsentMissing] = React.useState(false);
  const [consentRow, animate] = useAnimate();
  const reduce = useReducedMotion();
  const amount = Number(input);
  const valid = input !== "" && amount >= range.min && amount <= range.max;
  const amountError = input !== "" && !valid ? `Enter a whole amount from $${range.min} to $${range.max}.` : null;

  // A disabled button gets no clicks, so its wrapper catches them and points at the box still to tick.
  const pointAtConsent = () => {
    if (consent || !valid) return;
    setConsentMissing(true);
    if (!reduce) void animate(consentRow.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.4 });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Buy credits"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <span onClick={pointAtConsent} className="select-none">
            <Button loading={buying} disabled={!valid || !consent} onClick={() => onBuy(amount)}>
              {valid ? `Pay $${amount}` : "Pay"}
            </Button>
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Field
            id="credit-amount"
            label="Amount in USD"
            inputMode="numeric"
            autoComplete="off"
            data-autofocus
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
            hint={`$${range.min} to $${range.max}`}
            error={amountError}
          />
          <Segmented
            id="credit-presets"
            label="Preset amounts"
            options={amounts.map((a) => ({ value: String(a), label: `$${a}` }))}
            value={input}
            onChange={setInput}
            className="w-full"
          />
        </div>
        <div ref={consentRow}>
          <Checkbox
            id="credit-consent"
            checked={consent}
            aria-invalid={consentMissing || undefined}
            onChange={(e) => {
              setConsent(e.target.checked);
              setConsentMissing(false);
            }}
          >
            Add the credits right away. If I withdraw within 14 days, I get back only the credits I haven&apos;t used, and once all are used I can&apos;t withdraw.{" "}
            <a href={`${LANDING_URL}/terms`} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-4">
              Terms
            </a>
          </Checkbox>
        </div>
      </div>
    </Dialog>
  );
}

function RatesTable({ rates }: { rates: RatesState }) {
  if (rates.state !== "ready" || rates.rows.length === 0) {
    const text = rates.state === "loading" ? "Loading rates…" : rates.state === "error" ? "Rates are unavailable right now." : "No models available.";
    return (
      <p role="status" className="px-4 py-3.5 text-[13.5px] text-muted">
        {text}
      </p>
    );
  }
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          <th scope="col" className="py-2.5 pl-4 font-normal">
            Model
          </th>
          {["Input", "Cached", "Output"].map((h) => (
            <th key={h} scope="col" className="w-[4.25rem] py-2.5 text-right font-normal last:w-[5.25rem] last:pr-4">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rates.rows.map((r) => (
          <tr key={r.key}>
            <th scope="row" className="py-3 pl-4 pr-2 text-left font-normal">
              <span className="block text-[14.5px] font-medium tracking-[-0.01em]">{r.name}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{r.meta}</span>
            </th>
            {[r.input, r.cachedInput, r.output].map((v, i) => (
              <td key={i} className="py-3 text-right font-mono text-[12.5px] tabular-nums last:pr-4">
                {formatRate(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UsageSettings(p: UsageSettingsProps) {
  const [buying, setBuying] = React.useState(false);

  return (
    <>
      <UsageCard plan={p.plan} window={p.window} renewalPending={p.renewalPending} />

      <Group title="Credits" className="mt-6">
        <Row
          label={formatUSD(p.credits)}
          description="Used after your plan allowance runs out."
          control={
            <Button variant="secondary" onClick={() => setBuying(true)}>
              Buy credits
            </Button>
          }
        />
      </Group>

      {p.plan === "free" && p.onUpgrade && (
        <Group className="mt-6">
          <Row
            label="Need more room?"
            description="Pro has a much larger allowance, plus Heavy and more models."
            control={
              <button
                type="button"
                onClick={p.onUpgrade}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-inverse px-4 text-[13.5px] font-medium text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97]"
              >
                See Pro
                <ArrowUpRight className="size-3.5" />
              </button>
            }
          />
        </Group>
      )}

      <Group title="Rates per 1M tokens">
        <RatesTable rates={p.rates} />
      </Group>

      <BuyCreditsDialog
        open={buying}
        onClose={() => setBuying(false)}
        amounts={p.creditAmounts}
        range={p.creditRange}
        onBuy={p.onBuyCredits}
        buying={p.buyingCredits}      />
    </>
  );
}
