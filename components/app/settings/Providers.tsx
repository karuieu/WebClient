"use client";

import * as React from "react";
import { Switch } from "@/components/kit/Controls";
import { ArrowUpRight } from "@/components/kit/icons";
import { InfoHint } from "@/components/kit/InfoHint";
import { cx } from "@/lib/ui/cx";
import { Group, Row } from "./Layout";

export type HelperProvider = {
  name: string;
  model: string;
  links: string[];
};

export type ProvidersSettingsProps = {
  helper: HelperProvider;
  autoSearch: boolean;
  onAutoSearch: (v: boolean) => void;
};

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProvidersSettings(p: ProvidersSettingsProps): React.JSX.Element {
  return (
    <>
      <section>
        <div className="relative mb-3 flex items-center gap-1 px-1">
          <h3 className="text-label text-fg/80">Helper model</h3>
          <InfoHint label="About the helper model" className="-my-3">
            Only memory updates and conversation summaries use this provider. Your chat model keeps its own provider.
          </InfoHint>
        </div>
        <div className="rounded-2xl border border-line bg-elevated p-5 pb-3">
          <p className="text-[16px] font-medium tracking-[-0.015em]">{p.helper.name}</p>
          <p className="mt-1 font-mono text-[11px] text-muted">{p.helper.model} · hardware verified in your browser</p>
          <div className="mt-3 flex gap-3">
            {p.helper.links.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 font-mono text-[11px] text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {host(link)}
                <ArrowUpRight className="size-3" />
              </a>
            ))}
          </div>
        </div>
      </section>

      <Group title="Search">
        <Row
          label="Search the web automatically"
          description="New chats start with Search on. Only the query is sent, never your conversation."
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
    </>
  );
}
