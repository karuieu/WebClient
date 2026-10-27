"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { setToolApprovalHandler, type ToolApprovalRequest } from "@/lib/connectors/toolApproval";

type Pending = ToolApprovalRequest & { resolve: (ok: boolean) => void };

export function ToolApprovalHost() {
  const [queue, setQueue] = React.useState<Pending[]>([]);
  const current = queue[0];

  React.useEffect(() => {
    setToolApprovalHandler((request) => new Promise<boolean>((resolve) => setQueue((q) => [...q, { ...request, resolve }])));
    return () => setToolApprovalHandler(null);
  }, []);

  const answer = (ok: boolean) => {
    current?.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  const args = current ? JSON.stringify(current.args, null, 2) : "";

  return (
    <Dialog
      open={Boolean(current)}
      onClose={() => answer(false)}
      title={current ? `Let Karui use ${current.tool}?` : ""}
      description={current ? `This can change something in ${current.connector}. Nothing happens until you allow it.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={() => answer(false)}>
            Don&apos;t allow
          </Button>
          <Button data-autofocus onClick={() => answer(true)}>
            Allow
          </Button>
        </>
      }
    >
      {current && (
        <>
          {current.description && <p className="text-pretty text-[13.5px] leading-relaxed text-muted">{current.description}</p>}
          {args !== "{}" && (
            <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-fg/85">
              {args}
            </pre>
          )}
        </>
      )}
    </Dialog>
  );
}
