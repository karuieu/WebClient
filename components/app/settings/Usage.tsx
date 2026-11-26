"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "@/components/kit/icons";
import { Group, Row, SectionIntro } from "./Layout";

export type UsageWindow = {
  label: string;
  used: number;
  limit: number;
  resetAt?: string | null;
};

export type UsageSettingsProps = {
  plan: "free" | "pro";
  window: UsageWindow;
  week?: UsageWindow;
  inputRate: number;
  outputRate: number;
  onUpgrade?: () => void;
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

function UsageCard({ plan, window: w }: { plan: "free" | "pro"; window: UsageWindow }) {
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
    </section>
  );
}

export function UsageSettings({ plan, window: w, week, inputRate, outputRate, onUpgrade }: UsageSettingsProps) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <UsageCard plan={plan} window={w} />
        {week && <UsageCard plan={plan} window={week} />}
      </div>

      {plan === "free" && onUpgrade && (
        <Group className="mt-6">
          <Row
            label="Need more room?"
            description="Pro has a much larger allowance, plus Heavy and more models."
            control={
              <button
                type="button"
                onClick={onUpgrade}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-inverse px-4 text-[13.5px] font-medium text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97]"
              >
                See Pro
                <ArrowUpRight className="size-3.5" />
              </button>
            }
          />
        </Group>
      )}

      <SectionIntro>
        Every model costs {formatUSD(inputRate)} per million input tokens and {formatUSD(outputRate)} per million output tokens.
      </SectionIntro>
    </>
  );
}
