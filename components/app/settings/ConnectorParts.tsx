"use client";

import * as React from "react";
import { Segmented, type SegmentedOption } from "@/components/kit/Segmented";
import { cx } from "@/lib/cx";
import { BrandLogo, isBrandLogoId } from "./BrandLogo";
import type { ConnectorInfo, ConnectorRoute } from "@/lib/connectors";

export type ConnectorStatus = "available" | "connected" | "expired";

export type ConnectorItem = ConnectorInfo & {
  status: ConnectorStatus;
  route: ConnectorRoute;
  account?: string;
  custom?: boolean;
  ready?: boolean;
};

export class ConnectError extends Error {
  constructor(
    message: string,
    readonly href?: string,
  ) {
    super(message);
  }
}

export const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;

export const ROUTES: readonly SegmentedOption<ConnectorRoute>[] = [
  { value: "browser", label: "Browser" },
  { value: "server", label: "Karui server" },
];

const ROUTES_BROWSER_ONLY: readonly SegmentedOption<ConnectorRoute>[] = [
  { value: "browser", label: "Browser" },
  { value: "server", label: "Karui server · Soon", disabled: true },
];

export function routeOptions(serverRoute: boolean): readonly SegmentedOption<ConnectorRoute>[] {
  return serverRoute ? ROUTES : ROUTES_BROWSER_ONLY;
}

export function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function routeLabel(route: ConnectorRoute) {
  return route === "browser" ? "Browser" : "Karui server";
}

export function routeNote(c: ConnectorItem) {
  if (!c.browser) return `${c.name} only accepts connections from a server for now, so this one goes through Karui's servers.`;
  if (c.route === "server") return `What ${c.name} sends passes through Karui's servers on its way to you.`;
  if (c.app) return `Signing in goes through Karui's servers. After that, what ${c.name} sends never passes through them.`;
  return `Straight from your browser. What ${c.name} sends never passes through Karui's servers.`;
}

const tileSizes = {
  md: { tile: "size-9 rounded-[11px] text-[14px]", logo: "size-[18px]" },
  lg: { tile: "size-14 rounded-[16px] text-[21px]", logo: "size-7" },
};

export function Tile({ logo, name, size = "md", className }: { logo?: string; name: string; size?: keyof typeof tileSizes; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center bg-surface font-medium tracking-[-0.01em] ring-1 ring-inset ring-line",
        tileSizes[size].tile,
        className,
      )}
    >
      {logo && isBrandLogoId(logo) ? <BrandLogo id={logo} className={tileSizes[size].logo} /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

export function ConnectionControls({
  connector: c,
  onRoute,
  onDisconnect,
  label = "Connection",
  serverRoute = true,
}: {
  connector: ConnectorItem;
  onRoute: (id: string, route: ConnectorRoute) => void;
  onDisconnect: (id: string) => void;
  label?: string | null;
  serverRoute?: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {label && <p className="text-[14px] font-medium tracking-[-0.01em]">{label}</p>}
        {c.browser ? (
          <Segmented
            id={`connector-route-${c.id}`}
            label={`Connection for ${c.name}`}
            size="sm"
            options={routeOptions(serverRoute)}
            value={c.route}
            onChange={(r) => onRoute(c.id, r)}
          />
        ) : (
          <span className="font-mono text-[11px] text-muted">Karui server</span>
        )}
      </div>
      <p className="mt-1.5 max-w-[30rem] text-pretty text-[13px] leading-relaxed text-muted">{routeNote(c)}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="truncate font-mono text-[11px] text-subtle">{host(c.url)}</span>
        <button
          type="button"
          onClick={() => onDisconnect(c.id)}
          className="-mr-2 h-9 shrink-0 cursor-pointer rounded-full px-4 text-[13.5px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
        >
          Disconnect
        </button>
      </div>
    </>
  );
}
