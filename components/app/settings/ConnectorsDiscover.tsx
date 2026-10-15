"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Check, ChevronLeft, Plus, Search } from "@/components/kit/icons";
import { Segmented, type SegmentedOption } from "@/components/kit/Segmented";
import { CONNECTOR_CATEGORIES, categoryLabel, defaultRoute, type ConnectorCategory, type ConnectorRoute } from "@/lib/connectors";
import { Group, Row } from "./Layout";
import { ConnectionControls, host, routeNote, routeOptions, Tile, type ConnectorItem } from "./ConnectorParts";

type CategoryFilter = "all" | ConnectorCategory;

const CATEGORY_OPTIONS: readonly SegmentedOption<CategoryFilter>[] = [
  { value: "all", label: "All" },
  ...CONNECTOR_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
];

function ConnectedMark() {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
      <Check className="size-3" />
      Connected
    </span>
  );
}

function FeaturedCard({ connector: c, onOpen }: { connector: ConnectorItem; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(c.id)}
      className="flex min-h-48 cursor-pointer flex-col rounded-2xl border border-line bg-elevated p-5 text-left transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-soft"
    >
      <span className="flex items-start justify-between gap-3">
        <Tile name={c.name} size="lg" />
        {c.status === "connected" && <ConnectedMark />}
      </span>
      <span className="mt-auto pt-6 text-[18px] font-medium leading-snug tracking-[-0.02em] text-pretty">{c.pitch}</span>
      <span className="mt-2 font-mono text-[11px] text-muted">
        {c.name} · {categoryLabel(c.category)}
      </span>
    </button>
  );
}

function Card({ connector: c, onOpen }: { connector: ConnectorItem; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(c.id)}
      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-elevated p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-soft"
    >
      <Tile name={c.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em]">{c.name}</span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{c.description}</span>
        <span className="mt-2.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-subtle">{c.browser ? "Browser" : "Karui server"}</span>
          {c.status === "connected" && <ConnectedMark />}
        </span>
      </span>
    </button>
  );
}

export function ConnectorsDiscover({
  connectors,
  onOpen,
  onAddOwn,
}: {
  connectors: ConnectorItem[];
  onOpen: (id: string) => void;
  onAddOwn?: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<CategoryFilter>("all");

  const catalog = connectors.filter((c) => !c.custom);
  const q = query.trim().toLowerCase();
  const results = catalog.filter(
    (c) => (category === "all" || c.category === category) && (!q || `${c.name} ${c.description}`.toLowerCase().includes(q)),
  );
  const browsing = !q && category === "all";
  const featured = browsing ? catalog.filter((c) => c.pitch) : [];

  return (
    <>
      <label className="flex h-11 items-center gap-2.5 rounded-full border border-line-strong bg-bg px-4 transition-[border-color] duration-150 focus-within:border-fg/40">
        <Search className="size-4 text-muted" />
        <input
          data-focus="within"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
          placeholder="Search connectors"
          aria-label="Search connectors"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] tracking-[-0.01em] outline-none placeholder:text-subtle focus-visible:outline-none"
        />
      </label>
      <div className="mt-3 w-fit max-w-full">
        <Segmented id="connectors-category" label="Category" size="sm" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </div>

      {featured.length > 0 && (
        <section className="mt-9">
          <h3 className="text-label mb-3 px-1 text-fg/80">Featured</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((c) => (
              <FeaturedCard key={c.id} connector={c} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-9">
        <h3 className="text-label mb-3 px-1 text-fg/80">
          {browsing ? "All connectors" : `${results.length} ${results.length === 1 ? "result" : "results"}`}
        </h3>
        {results.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((c) => (
              <Card key={c.id} connector={c} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="text-[14.5px] font-medium tracking-[-0.01em]">Nothing here yet</p>
            <p className="mx-auto mt-1.5 max-w-[22rem] text-pretty text-[13px] leading-relaxed text-muted">
              If the app you&apos;re after has an MCP server, you can add it yourself.
            </p>
            {onAddOwn && (
              <Button variant="secondary" className="mt-5" onClick={onAddOwn}>
                <Plus className="size-3.5" />
                Add your own
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function ConnectDialog({
  connector: c,
  open,
  serverRoute,
  onClose,
  onConnect,
}: {
  connector: ConnectorItem;
  open: boolean;
  serverRoute: boolean;
  onClose: () => void;
  onConnect: (id: string, route: ConnectorRoute) => void;
}) {
  const browser = c.browser;
  const [route, setRoute] = React.useState<ConnectorRoute>(defaultRoute({ browser }));

  React.useEffect(() => {
    if (open) setRoute(defaultRoute({ browser }));
  }, [open, browser]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Connect ${c.name}`}
      description={c.browser ? "Choose how Karui reaches it. You can switch later." : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-autofocus
            onClick={() => {
              onConnect(c.id, route);
              onClose();
            }}
          >
            Connect
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span className="text-sm font-medium tracking-[-0.01em]">Connection</span>
        {c.browser ? (
          <Segmented
            id={`connect-route-${c.id}`}
            label="Connection"
            size="sm"
            options={routeOptions(serverRoute)}
            value={route}
            onChange={setRoute}
          />
        ) : (
          <span className="font-mono text-[11px] text-muted">Karui server</span>
        )}
      </div>
      <p className="mt-2 text-pretty text-[13px] leading-relaxed text-muted">{routeNote({ ...c, route })}</p>
    </Dialog>
  );
}

export function ConnectorDetail({
  connector: c,
  backLabel,
  serverRoute = true,
  onBack,
  onConnect,
  onRoute,
  onDisconnect,
}: {
  connector: ConnectorItem;
  backLabel: string;
  serverRoute?: boolean;
  onBack: () => void;
  onConnect?: (id: string, route: ConnectorRoute) => void;
  onRoute: (id: string, route: ConnectorRoute) => void;
  onDisconnect: (id: string) => void;
}) {
  const [choosing, setChoosing] = React.useState(false);
  const connected = c.status === "connected";
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full pl-1.5 pr-3 text-[13px] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        {backLabel}
      </button>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Tile name={c.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-heading truncate">{c.name}</h3>
          <p className="mt-1 truncate font-mono text-[11px] text-muted">
            {categoryLabel(c.category)} · {host(c.url)}
          </p>
        </div>
        {connected ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-[13.5px] font-medium">
            <Check className="size-3.5" />
            Connected
          </span>
        ) : (
          <Button loading={c.status === "connecting"} disabled={!onConnect} onClick={() => setChoosing(true)}>
            {onConnect ? "Connect" : "Soon"}
          </Button>
        )}
      </div>

      {(c.pitch || c.description) && (
        <p className="mt-6 max-w-[32rem] text-pretty text-[15px] leading-relaxed">{c.pitch ?? c.description}</p>
      )}

      <Group title="What Karui can do" className="mt-9">
        {c.abilities.length > 0 ? (
          c.abilities.map((a) => (
            <div key={a.label} className="flex min-h-12 items-center justify-between gap-4 px-4 py-3">
              <span className="text-[14px] tracking-[-0.01em]">{a.label}</span>
              {a.changes && <span className="shrink-0 font-mono text-[11px] text-muted">asks you first</span>}
            </div>
          ))
        ) : (
          <div className="px-4 py-3.5 text-[13.5px] leading-relaxed text-muted">Karui lists what this server can do once it&apos;s connected.</div>
        )}
      </Group>

      <Group
        title="Connection"
        footer={`${c.name} sees what Karui asks it for, like any app you sign in to.`}
      >
        {connected ? (
          <div className="px-4 py-3.5">
            <ConnectionControls connector={c} onRoute={onRoute} onDisconnect={onDisconnect} label={null} serverRoute={serverRoute} />
          </div>
        ) : (
          <Row
            label={c.browser ? "Browser or Karui server" : "Karui server"}
            description={c.browser ? undefined : routeNote(c)}
          />
        )}
      </Group>

      {onConnect && (
        <ConnectDialog connector={c} open={choosing} serverRoute={serverRoute} onClose={() => setChoosing(false)} onConnect={onConnect} />
      )}
    </>
  );
}
