"use client";

import * as React from "react";
import { MotionConfig, motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Switch } from "@/components/kit/Controls";
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
  /** Pro only for this account: shown, but can't be picked. */
  locked?: boolean;
};

export type ProvidersSettingsProps = {
  providers: ProviderOption[] | null;
  provider: string;
  onProvider: (id: string) => void;
  autoSearch: boolean;
  onAutoSearch: (v: boolean) => void;
  error?: string;
  onRetry?: () => void;
};

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProvidersSettings(p: ProvidersSettingsProps): React.JSX.Element {
  const radioId = React.useId();
  const group = React.useRef<HTMLDivElement>(null);
  const providers = p.providers ?? [];
  const available = providers.filter((provider) => !provider.locked);
  const hasSelection = available.some((provider) => provider.id === p.provider);

  const selectByKey = (event: React.KeyboardEvent<HTMLButtonElement>, id: string): void => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || available.length === 0) return;
    event.preventDefault();
    const current = available.findIndex((provider) => provider.id === id);
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (current + direction + available.length) % available.length;
    p.onProvider(available[next].id);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')[next]?.focus();
  };

  return (
    <MotionConfig reducedMotion="user">
      <SectionIntro>
        Every provider runs models inside hardware enclaves. Light runs on NEAR AI and Heavy on Phala; for models both offer, pick where your chats are processed. Karui only ever uses that one, even when it can&apos;t answer.
      </SectionIntro>

      <section>
        <h3 className="text-label mb-3 px-1 text-fg/80">Provider</h3>
        {p.error ? (
          <div className="rounded-2xl border border-line bg-elevated p-5">
            <p role="alert" className="text-[14px] leading-relaxed">{p.error}</p>
            {p.onRetry && <Button variant="secondary" size="lg" className="mt-4" onClick={p.onRetry}>Retry providers</Button>}
          </div>
        ) : p.providers === null ? (
          <p role="status" className="rounded-2xl border border-line bg-elevated p-5 text-[14px] text-muted">Loading providers…</p>
        ) : providers.length === 0 ? (
          <div className="rounded-2xl border border-line bg-elevated p-5">
            <p className="text-[14px] leading-relaxed text-muted">No providers are available. Reload the list to try again.</p>
            {p.onRetry && <Button variant="secondary" size="lg" className="mt-4" onClick={p.onRetry}>Reload providers</Button>}
          </div>
        ) : (
          <div ref={group} role="radiogroup" aria-label="Provider" className="grid gap-3 sm:grid-cols-2">
            {providers.map((o) => {
              const active = o.id === p.provider;
              return (
                <div key={o.id} className="relative">
                  <button
                    type="button"
                    role="radio"
                    aria-label={o.name}
                    aria-checked={active}
                    aria-describedby={`${radioId}-${o.id}`}
                    tabIndex={active || (!hasSelection && o.id === available[0]?.id) ? 0 : -1}
                    disabled={o.locked}
                    onClick={() => p.onProvider(o.id)}
                    onKeyDown={(event) => selectByKey(event, o.id)}
                    className={cx(
                      "relative flex h-full w-full flex-col rounded-2xl border bg-elevated p-5 pb-16 text-left transition-[border-color,box-shadow] duration-200",
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
                          active ? "border-inverse bg-inverse text-on-inverse" : "border-muted",
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
                    <span id={`${radioId}-${o.id}`} className="mt-3 text-pretty text-[13px] leading-relaxed text-muted">{o.description}</span>
                    <span className="mt-4 flex flex-wrap gap-1.5">
                      {o.models.map((m) => (
                        <span key={m.name} className="rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-muted">
                          {m.name}
                          {m.tier && <span className="text-fg/70"> · {m.tier}</span>}
                        </span>
                      ))}
                    </span>
                  </button>
                  <div className="absolute bottom-3 left-5 flex gap-3">
                    {o.links.map((l) => (
                      <a
                        key={l}
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 font-mono text-[11px] text-muted underline-offset-4 hover:text-fg hover:underline"
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
        )}
      </section>

      <Group title="Search">
        <Row
          label="Search the web automatically"
          description="Start new chats with Search on. Only the search query is sent out, never your conversation."
          control={
            <span className={cx(
              "[&>button]:before:absolute [&>button]:before:-inset-y-[9px] [&>button]:before:inset-x-0 [&>button]:before:content-['']",
              "[&>button[aria-checked=false]]:ring-muted [&>button[aria-checked=false]>span]:bg-muted",
            )}>
              <Switch checked={p.autoSearch} onChange={p.onAutoSearch} label="Search the web automatically" />
            </span>
          }
        />
      </Group>
    </MotionConfig>
  );
}
