"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { AlertCircle, ArrowUpRight, Check, ChevronDown, ChevronLeft, Plus, Search } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { Segmented } from "@/components/kit/Segmented";
import { cx } from "@/lib/ui/cx";
import { CONNECTOR_CATEGORIES, categoryLabel, defaultRoute, type ConnectorCategory, type ConnectorRoute } from "@/lib/connectors/connectors";
import { Group, Row } from "./Layout";
import { ConnectError, ConnectionControls, host, routeNote, routeOptions, Tile, type ConnectorItem } from "./ConnectorParts";

type CategoryFilter = "all" | ConnectorCategory;

export type ConnectHandler = (id: string, route: ConnectorRoute, signal: AbortSignal) => Promise<void>;

function StatusMark({ connector: c }: { connector: ConnectorItem }) {
  if (c.status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
        <Check className="size-3" />
        Connected
      </span>
    );
  }
  if (c.status === "expired") return <span className="font-mono text-[11px] text-muted">Sign in again</span>;
  if (c.ready === false) return <span className="font-mono text-[11px] text-muted">Soon</span>;
  return null;
}

function CategoryMenu({ value, onChange }: { value: CategoryFilter; onChange: (value: CategoryFilter) => void }) {
  const label = value === "all" ? "All categories" : categoryLabel(value);
  const item = (v: CategoryFilter, text: string): MenuItem => ({ label: text, checked: v === value, onSelect: () => onChange(v) });
  return (
    <Menu
      label="Category"
      sheetTitle="Category"
      items={[item("all", "All categories"), { type: "separator" }, ...CONNECTOR_CATEGORIES.map((c) => item(c.id, c.label))]}
    >
      {({ open, triggerProps }) => (
        <button
          {...triggerProps}
          aria-label={`Category: ${label}`}
          className={cx(
            "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-bg pl-4 pr-3.5 text-[14px] tracking-[-0.01em] transition-colors duration-150 hover:bg-surface",
            open && "bg-surface",
          )}
        >
          {label}
          <ChevronDown className={cx("size-3.5 text-muted transition-transform duration-200 ease-out-soft", open && "rotate-180")} />
        </button>
      )}
    </Menu>
  );
}

function Card({ connector: c, onOpen }: { connector: ConnectorItem; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(c.id)}
      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-elevated p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-soft"
    >
      <Tile logo={c.id} name={c.name} />
      <span className="flex min-w-0 flex-1 flex-col self-stretch">
        <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em]">{c.name}</span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{c.description}</span>
        <span className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <span className="font-mono text-[11px] text-subtle">{c.browser ? "Browser" : "Karui server"}</span>
          <StatusMark connector={c} />
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
  const [flat, setFlat] = React.useState(false);
  const topRef = React.useRef<HTMLDivElement>(null);

  const showFlat = (value: boolean) => {
    setFlat(value);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "nearest" }));
  };

  const q = query.trim().toLowerCase();
  const matches = connectors.filter((c) => !c.custom && (!q || `${c.name} ${c.description}`.toLowerCase().includes(q)));
  const sections: { id: string; label: string; items: ConnectorItem[] }[] = flat
    ? [{ id: "all", label: "All connectors", items: matches }]
    : CONNECTOR_CATEGORIES.filter((g) => category === "all" || g.id === category).map((g) => ({
        ...g,
        items: matches.filter((c) => c.category === g.id),
      }));
  const groups = sections.filter((g) => g.items.length > 0);

  return (
    <>
      <div ref={topRef} className="flex gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line-strong bg-bg px-4 transition-[border-color] duration-150 focus-within:border-fg/40">
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
        <CategoryMenu
          value={category}
          onChange={(v) => {
            setCategory(v);
            setFlat(false);
          }}
        />
      </div>

      {flat && (
        <button
          type="button"
          onClick={() => showFlat(false)}
          className="relative -ml-2 mt-6 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full pl-1.5 pr-3 text-[13px] text-muted transition-colors duration-150 after:absolute after:-inset-1.5 after:content-[''] hover:bg-surface hover:text-fg"
        >
          <ChevronLeft className="size-3.5" />
          Categories
        </button>
      )}

      {groups.map((g, i) => (
        <section key={g.id} className={flat ? "mt-4" : "mt-9"}>
          <div className="mb-3 flex min-h-8 items-center justify-between gap-3 px-1">
            <h3 className="text-label text-fg/80">{g.label}</h3>
            {!flat && i === 0 && (
              <button
                type="button"
                onClick={() => {
                  showFlat(true);
                  setCategory("all");
                }}
                className="relative -mr-2 inline-flex h-8 cursor-pointer items-center rounded-full px-3 text-[13px] text-muted transition-colors duration-150 after:absolute after:-inset-1.5 after:content-[''] hover:bg-surface hover:text-fg"
              >
                See all
              </button>
            )}
          </div>
          <div className="grid auto-rows-fr gap-3 sm:grid-cols-2">
            {g.items.map((c) => (
              <Card key={c.id} connector={c} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <section className="mt-9">
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
        </section>
      )}

      <p className="mt-8 px-1 text-pretty text-[12.5px] leading-relaxed text-muted">
        Notion, Linear and the other names here are trademarks of their owners. Karui isn&apos;t affiliated with them.
      </p>
    </>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-fg underline-offset-4 hover:underline"
    >
      {children}
      <ArrowUpRight className="size-3" />
    </a>
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
  onConnect: ConnectHandler;
}) {
  const browser = c.browser;
  const expired = c.status === "expired";
  const [route, setRoute] = React.useState<ConnectorRoute>(defaultRoute({ browser }));
  const [waiting, setWaiting] = React.useState(false);
  const [error, setError] = React.useState<ConnectError | null>(null);
  const attempt = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setRoute(expired ? c.route : defaultRoute({ browser }));
    setWaiting(false);
    setError(null);
  }, [open, browser, expired, c.route]);

  const cancel = () => {
    attempt.current?.abort();
    onClose();
  };

  const connect = async () => {
    const controller = new AbortController();
    attempt.current = controller;
    setWaiting(true);
    setError(null);
    try {
      await onConnect(c.id, route, controller.signal);
      if (!controller.signal.aborted) onClose();
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof ConnectError ? err : new ConnectError(err instanceof Error ? err.message : `Couldn't connect ${c.name}.`));
    } finally {
      setWaiting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={cancel}
      title={expired ? `Sign in to ${c.name}` : `Connect ${c.name}`}
      description={
        waiting
          ? `Finish signing in to ${c.name} in the window that opened.`
          : c.browser
            ? "Choose how Karui reaches it. You can switch later."
            : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button data-autofocus loading={waiting} onClick={connect}>
            {error ? "Try again" : expired ? "Sign in" : "Connect"}
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
      {c.notice && (
        <p className="mt-4 text-pretty rounded-2xl bg-surface px-4 py-3 text-[13px] leading-relaxed text-muted">
          {c.notice.text} <ExternalLink href={c.notice.href}>How to allow it</ExternalLink>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>
            {error.message} {error.href && <ExternalLink href={error.href}>What to do</ExternalLink>}
          </span>
        </p>
      )}
    </Dialog>
  );
}

function ConnectButton({ connector: c, onConnect, onChoose }: { connector: ConnectorItem; onConnect?: ConnectHandler; onChoose: () => void }) {
  if (c.status === "connected") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-[13.5px] font-medium">
        <Check className="size-3.5" />
        Connected
      </span>
    );
  }
  const ready = !!onConnect && c.ready !== false;
  return (
    <Button disabled={!ready} onClick={onChoose}>
      {!ready ? "Soon" : c.status === "expired" ? "Sign in again" : "Connect"}
    </Button>
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
  onConnect?: ConnectHandler;
  onRoute: (id: string, route: ConnectorRoute) => void;
  onDisconnect: (id: string) => void;
}) {
  const [choosing, setChoosing] = React.useState(false);
  const linked = c.status !== "available";
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
        <Tile logo={c.id} name={c.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-heading truncate">{c.name}</h3>
          <p className="mt-1 truncate font-mono text-[11px] text-muted">
            {categoryLabel(c.category)} · {host(c.url)}
          </p>
        </div>
        <ConnectButton connector={c} onConnect={onConnect} onChoose={() => setChoosing(true)} />
      </div>

      {c.status === "expired" && (
        <p className="mt-6 max-w-[32rem] text-pretty text-[14px] leading-relaxed text-muted">
          {c.name} signed Karui out. Chats can&apos;t use it until you sign in again.
        </p>
      )}

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
        {linked ? (
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
