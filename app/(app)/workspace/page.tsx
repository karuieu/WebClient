"use client";

import { Suspense } from "react";
import { WorkspacePage } from "@/components/wired/Workspace";

export default function Workspace() {
  return (
    <Suspense fallback={null}>
      <WorkspacePage />
    </Suspense>
  );
}
