"use client";

import { useEffect } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SystemState } from "@/components/app/SystemState";
import { Button, ButtonLink } from "@/components/kit/Button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[karui] route error:", error);
  }, [error]);

  return (
    <AuthShell>
      <SystemState
        label="Error"
        title="This page"
        titleMuted="didn't load."
        text={
          error.digest
            ? "Something broke while rendering it. Your chats and keys are stored separately, so trying again is safe. If it keeps happening, quote the reference below."
            : "Something broke while rendering it. Your chats and keys are stored separately, so trying again is safe."
        }
        detail={error.digest ? { caption: "Reference", value: error.digest } : null}
        actions={
          <>
            <Button size="lg" onClick={reset}>
              Try again
            </Button>
            <ButtonLink href="/" size="lg" variant="secondary">
              Home
            </ButtonLink>
          </>
        }
      />
    </AuthShell>
  );
}
