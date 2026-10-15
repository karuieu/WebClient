"use client";

import { usePathname } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SystemState } from "@/components/app/SystemState";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <AuthShell variant="system">
      <SystemState
        centered
        label="Not found"
        title="This page"
        titleMuted="wandered off."
        detail={pathname ? { caption: "Address", value: pathname } : null}
      />
    </AuthShell>
  );
}
