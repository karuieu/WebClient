"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Field } from "@/components/kit/Field";
import { ChevronDown, ChevronRight, Plus } from "@/components/kit/icons";
import { Segmented, type SegmentedOption } from "@/components/kit/Segmented";
import { cx } from "@/lib/cx";
import type { ConnectorRoute } from "@/lib/connectors";
import { BrandLogo, type BrandLogoId } from "./BrandLogo";
import { Group, Row } from "./Layout";
import { ConnectionControls, host, routeLabel, routeOptions, spring, Tile, type ConnectorItem } from "./ConnectorParts";
import { ConnectorDetail, ConnectorsDiscover, type ConnectHandler } from "./ConnectorsDiscover";

export { ConnectError, type ConnectorItem, type ConnectorStatus } from "./ConnectorParts";
export type { ConnectHandler } from "./ConnectorsDiscover";

export type NewConnector = { name: string; url: string; route: ConnectorRoute; token?: string };

export type ConnectorsSettingsProps = {
  locked?: boolean;
  onUpgrade?: () => void;
  connectors: ConnectorItem[];
  discover?: boolean;
  serverRoute?: boolean;
  onConnect?: ConnectHandler;
  onDisconnect: (id: string) => void;
  onRoute: (id: string, route: ConnectorRoute) => void;
  onAdd?: (connector: NewConnector) => void | Promise<void>;
  approval?: { mode: ToolApprovalMode; onChange: (mode: ToolApprovalMode) => void };
};

export type ToolApprovalMode = "untrusted" | "always";

const approvalOptions: readonly SegmentedOption<ToolApprovalMode>[] = [
  { value: "untrusted", label: "When needed" },
  { value: "always", label: "Always" },
];

type View = "yours" | "discover";

function viewOptions(discover: boolean): readonly SegmentedOption<View>[] {
  return [
    { value: "yours", label: "Yours" },
    { value: "discover", label: discover ? "Discover" : "Discover · Soon", disabled: !discover },
  ];
}

function YoursRow({
  connector: c,
  serverRoute,
  onRoute,
  onDisconnect,
  onOpen,
}: {
  connector: ConnectorItem;
  serverRoute: boolean;
  onRoute: (id: string, route: ConnectorRoute) => void;
  onDisconnect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const tools = c.abilities.length;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      >
        <Tile logo={c.id} name={c.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em]">{c.name}</span>
          <span className="block truncate font-mono text-[11px] text-muted">
            {c.status === "expired" ? "Signed out" : (c.account ?? host(c.url))} · {routeLabel(c.route)}
          </span>
        </span>
        <ChevronDown className={cx("size-3.5 text-muted transition-transform duration-300 ease-out-soft", !open && "-rotate-90")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 pb-3 pt-4 sm:pl-16">
              {c.status === "expired" && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                  <p className="text-pretty text-[13px] leading-relaxed text-muted">Chats can&apos;t use {c.name} until you sign in again.</p>
                  <Button onClick={() => onOpen(c.id)}>
                    Sign in again
                  </Button>
                </div>
              )}
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="-mx-2 mb-3 flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface"
              >
                <span className="text-[14px] font-medium tracking-[-0.01em]">What Karui can do</span>
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
                  {tools === 1 ? "1 tool" : `${tools} tools`}
                  <ChevronRight className="size-3.5" />
                </span>
              </button>
              <ConnectionControls connector={c} onRoute={onRoute} onDisconnect={onDisconnect} serverRoute={serverRoute} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Yours({
  connectors,
  discover,
  serverRoute,
  onRoute,
  onDisconnect,
  onOpen,
  onDiscover,
  onAddOwn,
}: {
  connectors: ConnectorItem[];
  discover: boolean;
  serverRoute: boolean;
  onRoute: (id: string, route: ConnectorRoute) => void;
  onDisconnect: (id: string) => void;
  onOpen: (id: string) => void;
  onDiscover: () => void;
  onAddOwn?: () => void;
}) {
  if (connectors.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="text-[15px] font-medium tracking-[-0.01em]">Nothing connected yet</p>
        <p className="mx-auto mt-1.5 max-w-[22rem] text-pretty text-[13.5px] leading-relaxed text-muted">
          {discover
            ? "Find the apps you use in Discover, or add your own MCP server."
            : "Add an MCP server you use. Karui talks to it straight from your browser."}
        </p>
        {discover ? (
          <Button variant="secondary" className="mt-6" onClick={onDiscover}>
            Browse Discover
          </Button>
        ) : (
          onAddOwn && (
            <Button variant="secondary" className="mt-6" onClick={onAddOwn}>
              <Plus className="size-3.5" />
              Add your own
            </Button>
          )
        )}
      </div>
    );
  }

  return (
    <Group
      footer={
        serverRoute
          ? "Each one talks to its app straight from your browser, unless the app only accepts server connections or you switch it."
          : "Each one talks to its app straight from your browser. Karui's servers never see what it sends."
      }
    >
      {connectors.map((c) => (
        <YoursRow key={c.id} connector={c} serverRoute={serverRoute} onRoute={onRoute} onDisconnect={onDisconnect} onOpen={onOpen} />
      ))}
    </Group>
  );
}

const LOCKED_LOGOS: BrandLogoId[] = ["notion", "linear", "asana", "sentry", "stripe"];

export function ConnectorsLocked({ onUpgrade }: { onUpgrade?: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center px-2 py-12 text-center sm:py-16">
      <div aria-hidden="true" className="flex -space-x-3">
        {LOCKED_LOGOS.map((id, i) => (
          <motion.span
            key={id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.06 + i * 0.04 }}
            className="grid size-11 place-items-center rounded-full border border-line bg-elevated ring-4 ring-bg"
          >
            <BrandLogo id={id} className="size-[18px]" />
          </motion.span>
        ))}
      </div>
      <h3 className="text-heading mt-7">Connectors come with Pro</h3>
      <p className="mt-2 max-w-[25rem] text-pretty text-[14px] leading-relaxed text-muted">
        Bring Notion, Linear, Asana and more into your chats.
      </p>
      {onUpgrade && (
        <Button className="mt-7" arrow onClick={onUpgrade}>
          See Pro
        </Button>
      )}
    </div>
  );
}

function AddDialog({
  open,
  serverRoute,
  onClose,
  onAdd,
}: {
  open: boolean;
  serverRoute: boolean;
  onClose: () => void;
  onAdd: (connector: NewConnector) => void | Promise<void>;
}) {
  const formId = React.useId();
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [token, setToken] = React.useState("");
  const [route, setRoute] = React.useState<ConnectorRoute>("browser");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setUrl("");
    setToken("");
    setRoute("browser");
    setError(null);
    setBusy(false);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setError("That doesn't look like an address. It should start with https://");
      return;
    }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
      setError("Use an https:// address.");
      return;
    }
    setBusy(true);
    try {
      await onAdd({
        name: name.trim() || parsed.hostname.replace(/^www\./, ""),
        url: parsed.toString(),
        route,
        token: token.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect to that server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Add your own"
      description="Any app with an MCP server. You'll find the address in its settings or docs."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Add
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
        <Field
          id={`${formId}-name`}
          label="Name"
          placeholder="Team wiki"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-autofocus
        />
        <Field
          id={`${formId}-url`}
          label="Server address"
          type="url"
          inputMode="url"
          placeholder="https://mcp.example.com/mcp"
          autoComplete="off"
          spellCheck={false}
          required
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          error={error}
        />
        <Field
          id={`${formId}-token`}
          label="Token"
          labelAside={<span className="text-[0.8125rem] text-muted">Optional</span>}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          hint="Only if the server asks for one. It's encrypted and stays on this device."
        />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span className="text-sm font-medium tracking-[-0.01em]">Connection</span>
          <Segmented id={`${formId}-route`} label="Connection" size="sm" options={routeOptions(serverRoute)} value={route} onChange={setRoute} />
        </div>
      </form>
    </Dialog>
  );
}

function Marketplace(p: ConnectorsSettingsProps) {
  const reduce = useReducedMotion();
  const discover = p.discover !== false;
  const serverRoute = p.serverRoute !== false;
  const connected = p.connectors.filter((c) => c.status !== "available");
  const [view, setView] = React.useState<View>(() => (!discover || connected.length > 0 ? "yours" : "discover"));
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState<ConnectorItem | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = React.useState(false);
  const pendingDisconnect = React.useRef<string | null>(null);
  const detail = detailId ? p.connectors.find((c) => c.id === detailId) : undefined;
  const addOwn = p.onAdd ? () => setAdding(true) : undefined;

  const requestDisconnect = (id: string): void => {
    const connector = p.connectors.find((c) => c.id === id);
    if (!connector) return;
    pendingDisconnect.current = id;
    setDisconnecting(connector);
    setConfirmingDisconnect(true);
  };

  const closeDisconnect = (): void => {
    pendingDisconnect.current = null;
    setConfirmingDisconnect(false);
  };

  return (
    <>
      <div className="mb-7 flex items-center justify-between gap-3">
        <div className="w-fit">
          <Segmented
            id="connectors-view"
            label="Connectors"
            options={viewOptions(discover)}
            value={view}
            onChange={(v) => {
              setView(v);
              setDetailId(null);
            }}
          />
        </div>
        <Button variant="secondary" onClick={addOwn} disabled={!addOwn}>
          <Plus className="size-3.5" />
          Add your own
        </Button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={detail ? `detail-${detail.id}` : view}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={spring}
        >
          {detail ? (
            <ConnectorDetail
              connector={detail}
              backLabel={view === "yours" ? "Yours" : "Discover"}
              serverRoute={serverRoute}
              onBack={() => setDetailId(null)}
              onConnect={p.onConnect}
              onRoute={p.onRoute}
              onDisconnect={requestDisconnect}
            />
          ) : view === "yours" ? (
            <Yours
              connectors={connected}
              discover={discover}
              serverRoute={serverRoute}
              onRoute={p.onRoute}
              onDisconnect={requestDisconnect}
              onOpen={setDetailId}
              onDiscover={() => setView("discover")}
              onAddOwn={addOwn}
            />
          ) : (
            <ConnectorsDiscover connectors={p.connectors} onOpen={setDetailId} onAddOwn={addOwn} />
          )}
        </motion.div>
      </AnimatePresence>

      {p.approval && !detail && view === "yours" && (
        <Group
          className="mt-9"
          footer="Web pages and tool results can contain instructions aimed at the model, and a tool that only reads can still send data out through the address it opens."
        >
          <Row
            label="Ask before a tool runs"
            description={
              p.approval.mode === "always"
                ? "Every call waits for your OK."
                : "Tools that change something always ask. Read-only tools ask too once web results or another tool's output are in the chat."
            }
            control={
              <Segmented
                id="connectors-approval"
                label="Ask before a tool runs"
                size="sm"
                options={approvalOptions}
                value={p.approval.mode}
                onChange={p.approval.onChange}
              />
            }
          />
        </Group>
      )}

      {p.onAdd && (
        <AddDialog
          open={adding}
          serverRoute={serverRoute}
          onClose={() => setAdding(false)}
          onAdd={async (c) => {
            await p.onAdd?.(c);
            setView("yours");
            setDetailId(null);
          }}
        />
      )}

      <Dialog
        open={confirmingDisconnect}
        onClose={closeDisconnect}
        title={`Disconnect ${disconnecting?.name ?? "this connector"}?`}
        description={
          disconnecting?.custom
            ? "Chats won't be able to use this connector. Its saved connection will be removed. You can add it again later."
            : "Chats won't be able to use this connector until you connect it again."
        }
        className="max-h-[90dvh] overflow-y-auto [&_h2]:[overflow-wrap:anywhere]"
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={closeDisconnect} data-autofocus>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="min-h-11"
              onClick={() => {
                const id = pendingDisconnect.current;
                if (!id) return;
                closeDisconnect();
                p.onDisconnect(id);
              }}
            >
              Disconnect
            </Button>
          </>
        }
      />
    </>
  );
}

export function ConnectorsSettings(p: ConnectorsSettingsProps) {
  if (p.locked) return <ConnectorsLocked onUpgrade={p.onUpgrade} />;
  return <Marketplace {...p} />;
}
