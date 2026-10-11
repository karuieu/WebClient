"use client";

import { usePathname } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SystemState } from "@/components/app/SystemState";
import { ButtonLink } from "@/components/kit/Button";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <AuthShell>
      <SystemState
        code="404"
        label="Not found"
        title="This page"
        titleMuted="wandered off."
        text="The link may be out of date, or the chat it pointed to was deleted. Everything else is right where you left it."
        detail={pathname ? { caption: "Address", value: pathname } : null}
        actions={
          <>
            <ButtonLink href="/new" size="lg" arrow>
              Start a chat
            </ButtonLink>
            <ButtonLink href="/chats" size="lg" variant="secondary">
              Your chats
            </ButtonLink>
          </>
        }
      />
    </AuthShell>
  );
}
