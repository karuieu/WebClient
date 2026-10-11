"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Switch } from "@/components/kit/Controls";
import { Segmented, type SegmentedOption } from "@/components/kit/Segmented";
import { ArrowUpRight, Check } from "@/components/kit/icons";
import { cx } from "@/lib/cx";
import { Group, Row, SectionIntro } from "./Layout";

export type ProviderOption = {
  id: string;
  name: string;
  description: string;
  region: string;
  verification: string;
  models: { name: string; tier?: "light" | "heavy" }[];
  links: string[];
  locked?: boolean;
};

export type HeavyHelperMode = "hybrid" | "heavy" | "qwen";

const heavyHelperOptions: readonly SegmentedOption<HeavyHelperMode>[] = [
  { value: "hybrid", label: "Fusion" },
  { value: "heavy", label: "Heavy" },
  { value: "qwen", label: "Qwen" },
];

const heavyHelperCopy: Record<HeavyHelperMode, string> = {
  hybrid: "Recommended. Qwen makes the quick decisions and passes hard questions to Heavy.",
  heavy: "Heavy makes every decision itself. Uses more of your plan than Fusion.",
  qwen: "Qwen makes every decision, even on hard questions. Uses the least of your plan.",
};

export type ProvidersSettingsProps = {
  providers: ProviderOption[];
  provider: string;
  onProvider: (id: string) => void;
  helperEnabled: boolean;
  onHelperEnabled: (v: boolean) => void;
  autoSearch: boolean;
  onAutoSearch: (v: boolean) => void;
  heavyHelper?: { mode: HeavyHelperMode; onChange: (m: HeavyHelperMode) => void };
};

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProvidersSettings(p: ProvidersSettingsProps) {
  const helperOff = !p.helperEnabled;
  return (
    <>
      <SectionIntro>
        Every provider runs models inside hardware enclaves. Light runs on NEAR AI and Heavy on Phala; for models both offer, pick where your chats are processed. Karui only ever uses that one, even when it can&apos;t answer.
      </SectionIntro>

      <section>
        <h3 className="text-label mb-3 px-1 text-fg/80">Provider</h3>
        <div role="radiogroup" aria-label="Provider" className="grid gap-3 sm:grid-cols-2">
          {p.providers.map((o) => {
            const active = o.id === p.provider;
            return (
              <div key={o.id} className="relative">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={o.locked}
                  onClick={() => p.onProvider(o.id)}
                  className={cx(
                    "relative flex h-full w-full flex-col rounded-2xl border bg-elevated p-5 pb-12 text-left transition-[border-color,box-shadow] duration-200",
                    o.locked ? "cursor-not-allowed border-line opacity-60" : "cursor-pointer",
                    !o.locked && (active ? "border-fg/50 shadow-soft" : "border-line hover:border-line-strong"),
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="text-[16px] font-medium tracking-[-0.015em]">{o.name}</span>
                      {o.locked && <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-muted">Pro</span>}
                    </span>
                    <span
                      className={cx(
                        "grid size-5 place-items-center rounded-full border transition-colors duration-150",
                        active ? "border-inverse bg-inverse text-on-inverse" : "border-line-strong",
                      )}
                    >
                      {active && (
                        <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}>
                          <Check className="size-3" />
                        </motion.span>
                      )}
                    </span>
                  </span>
                  <span className="mt-1 font-mono text-[11px] text-muted">
                    {o.region} · {o.verification}
                  </span>
                  <span className="mt-3 text-pretty text-[13px] leading-relaxed text-muted">{o.description}</span>
                  <span className="mt-4 flex flex-wrap gap-1.5">
                    {o.models.map((m) => (
                      <span key={m.name} className="rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-muted">
                        {m.name}
                        {m.tier && <span className="text-fg/70"> · {m.tier}</span>}
                      </span>
                    ))}
                  </span>
                </button>
                <div className="absolute bottom-4 left-5 flex gap-3">
                  {o.links.map((l) => (
                    <a
                      key={l}
                      href={l}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted underline-offset-4 hover:text-fg hover:underline"
                    >
                      {host(l)}
                      <ArrowUpRight className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Group
        title="Helper model"
        footer="The helper runs at the same provider as your chat: GLM 5.3 Flash at NEAR AI, Qwen 3.8 27B at Phala. It decides when to search and keeps memory tidy."
      >
        <Row
          label="Use a helper model"
          description="Turning it off also turns off web search."
          control={<Switch checked={p.helperEnabled} onChange={p.onHelperEnabled} label="Use a helper model" />}
        />
        {p.heavyHelper && (
          <Row label="In Heavy chats" description={heavyHelperCopy[p.heavyHelper.mode]}>
            <Segmented
              id="heavy-helper"
              label="In Heavy chats"
              size="sm"
              className="sm:max-w-72"
              options={heavyHelperOptions}
              value={p.heavyHelper.mode}
              onChange={p.heavyHelper.onChange}
            />
          </Row>
        )}
      </Group>

      <Group title="Features" className={cx("transition-opacity duration-300", helperOff && "pointer-events-none opacity-40")}>
        <Row
          label="Search the web automatically"
          description="Start new chats with Search on. Only the search query is sent out, never your conversation."
          control={<Switch checked={p.autoSearch} onChange={p.onAutoSearch} label="Search the web automatically" disabled={helperOff} />}
        />
      </Group>
    </>
  );
}
