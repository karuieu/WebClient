"use client";

import * as React from "react";
import { ConfirmIdentityDialog } from "@/components/app/ConfirmIdentityDialog";
import { setIdentityHandler, type IdentityRequest } from "@/lib/core/api";
import { confirmIdentity } from "@/lib/account/auth";

type Pending = IdentityRequest & { resolve: (confirmed: boolean) => void };

/** Asks for the password or a code whenever the server wants a fresh confirmation (Settings → Security → Ask before deleting). */
export function ConfirmIdentityHost() {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Leaving the app with the dialog open must still answer, or every later deletion would wait on it.
  const open = React.useRef<Pending | null>(null);

  React.useEffect(() => {
    setIdentityHandler(
      (request) =>
        new Promise<boolean>((resolve) => {
          open.current = { ...request, resolve };
          setPending(open.current);
        }),
    );
    return () => {
      setIdentityHandler(null);
      open.current?.resolve(false);
    };
  }, []);

  const finish = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    open.current = null;
    setPending(null);
    setError(null);
  };

  return (
    <ConfirmIdentityDialog
      open={pending !== null}
      check={pending?.check ?? "password"}
      purpose={pending?.purpose}
      error={error}
      loading={busy}
      onConfirm={async (secret, source) => {
        if (!pending) return;
        setBusy(true);
        const result = await confirmIdentity(pending.check, secret, source);
        setBusy(false);
        if (result.error) setError(result.error);
        else finish(true);
      }}
      onClose={() => finish(false)}
    />
  );
}
