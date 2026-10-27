"use client";

import { usePathname } from "next/navigation";
import { ResourceNotFound } from "@/components/app/ResourceNotFound";
import { notFoundTarget } from "@/lib/ui/notFoundTarget";

export default function AppNotFound() {
  const { kind, value } = notFoundTarget(usePathname() ?? "");
  return <ResourceNotFound kind={kind} value={value} />;
}
