"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Field } from "@/components/kit/Field";
import { Plus } from "@/components/kit/icons";
import { Segmented, type SegmentedOption } from "@/components/kit/Segmented";
import type { ConnectorRoute } from "@/lib/connectors/connectors";
import { BrandLogo, type BrandLogoId } from "./BrandLogo";
import { PAGE_ACTION, PageActions } from "../PageActions";
import { LIST_FRAME } from "./Layout";
import { ConnectorRow, host, routeLabel, routeOptions, spring, type ConnectorItem } from "./ConnectorParts";
import { ConnectorDetail, ConnectorsDiscover, type ConnectHandler } from "./ConnectorsDiscover";

export { ConnectError, type ConnectorItem, type ConnectorStatus } from "./ConnectorParts";
export type { ConnectHandler } from "./ConnectorsDiscover";

export type NewConnector = { name: string; url: string; route: ConnectorRoute; token?: string };

export type ConnectorsSettingsProps = {
  locked?: boolean;
  onUpgrade?: () => void;
  connectors: ConnectorItem[];
  /** false shows Discover as coming soon. */
  discover?: boolean;
  /** false shows the Karui server route as coming soon. */
  serverRoute?: boolean;
  /** Runs the sign-in; the signal aborts when the user cancels. Rejecting shows the error in the dialog. */
  onConnect?: ConnectHandler;
  onDisconnect: (id: string) => void;
  onRoute: (id: string, route: ConnectorRoute) => void;
  /** Rejecting keeps the dialog open and shows the error's message. */
  onAdd?: (connector: NewConnector) => void | Promise<void>;
  /** When tools wait for "Allow"; omitted hides the choice. */
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

function Yours({
  connectors,
  discover,
  onOpen,
  onDiscover,
}: {
  connectors: ConnectorItem[];
  discover: boolean;
  onOpen: (id: string) => void;
  onDiscover: () => void;
}) {
  if (connectors.length === 0) {
    return (
      <div className="px-4 py-6">
        <p className="text-[15px] text-muted">Nothing connected yet.</p>
        {discover && (
          <Button variant="secondary" className="mt-5" onClick={onDiscover}>
            Browse Discover
          </Button>
        )}
      </div>
    );
  }

  return (
    <ul className={LIST_FRAME}>
      {connectors.map((c) => (
        <li key={c.id}>
          <ConnectorRow
            connector={c}
            meta={`${c.status === "expired" ? "Signed out" : (c.account ?? host(c.url))} · ${routeLabel(c.route)}`}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
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
      <PageActions>
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
        <Button onClick={addOwn} disabled={!addOwn} className={PAGE_ACTION}>
          <Plus className="size-3.5" />
          Add own
        </Button>
      </PageActions>

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
            <Yours connectors={connected} discover={discover} onOpen={setDetailId} onDiscover={() => setView("discover")} />
          ) : (
            <ConnectorsDiscover connectors={p.connectors} onOpen={setDetailId} onAddOwn={addOwn} />
          )}
        </motion.div>
      </AnimatePresence>

      {p.approval && !detail && view === "yours" && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-line-strong px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[15px] tracking-[-0.01em]">Ask before a tool runs</p>
            <p className="mt-1 text-[13px] text-muted">
              {p.approval.mode === "always" ? "Every tool asks first." : "Changes always ask. Reads ask once a chat has web or tool results."}
            </p>
          </div>
          <Segmented id="connectors-approval" label="Ask before a tool runs" size="sm" options={approvalOptions} value={p.approval.mode} onChange={p.approval.onChange} />
        </div>
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
