"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Field } from "@/components/kit/Field";
import { Segmented } from "@/components/kit/Segmented";

export type IdentityCheck = "password" | "two_factor";
export type CodeSource = "app" | "backup";

/** Asked when the server wants a fresh confirmation before a deletion; one confirmation covers the next five minutes. */
export function ConfirmIdentityDialog({
  open,
  check,
  purpose = "delete",
  error,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  check: IdentityCheck;
  /** "settings": changing what deleting asks for, which needs the same confirmation. */
  purpose?: "delete" | "settings";
  error?: string | null;
  loading?: boolean;
  onConfirm: (secret: string, source: CodeSource) => void;
  onClose: () => void;
}) {
  const formId = React.useId();
  const [source, setSource] = React.useState<CodeSource>("app");
  const [secret, setSecret] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setSource("app");
      setSecret("");
    }
  }, [open]);

  const password = check === "password";
  const digits = !password && source === "app";
  const ready = digits ? secret.length === 6 : secret.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm it's you"
      description={`${password ? "Enter your password" : "Enter a code from your authenticator app"} ${purpose === "settings" ? "to change what deleting asks for." : "to delete this."}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={loading} disabled={!ready}>
            Confirm
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onConfirm(secret, source);
        }}
      >
        {password ? (
          <Field
            id={`${formId}-password`}
            label="Password"
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            error={error}
            autoFocus
          />
        ) : (
          <>
            <Segmented
              id={`${formId}-source`}
              label="Code from"
              size="sm"
              options={[
                { value: "app", label: "Authenticator app" },
                { value: "backup", label: "Backup code" },
              ]}
              value={source}
              onChange={(v) => {
                setSource(v);
                setSecret("");
              }}
            />
            <Field
              key={source}
              id={`${formId}-code`}
              label={digits ? "6-digit code" : "Backup code"}
              inputMode={digits ? "numeric" : "text"}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={digits ? 6 : 11}
              placeholder={digits ? "000000" : "xxxxx-xxxxx"}
              value={secret}
              onChange={(e) => setSecret(digits ? e.target.value.replace(/\D/g, "") : e.target.value)}
              error={error}
              className="font-mono"
              autoFocus
            />
          </>
        )}
        <p className="text-[12.5px] leading-relaxed text-muted">Deleting won&apos;t ask again for the next 5 minutes.</p>
      </form>
    </Dialog>
  );
}
