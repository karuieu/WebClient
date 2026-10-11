"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { confirmAccountDeletion } from "@/lib/auth";
import { clearSession } from "@/lib/session";
import { DeleteAccountView } from "@/components/auth/DeleteAccountView";

export default function DeleteAccountPage() {
  return (
    <Suspense fallback={null}>
      <DeleteAccountContent />
    </Suspense>
  );
}

function DeleteAccountContent() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"confirm" | "success" | "error">(token ? "confirm" : "error");
  const [error, setError] = useState(token ? "" : "Missing confirmation token.");
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    if (!token || deleting) return;
    setDeleting(true);
    const result = await confirmAccountDeletion(token);
    if (result.success) {
      await clearSession().catch(() => {});
      setState("success");
    } else {
      setError(result.error || "This link is invalid or has expired.");
      setState("error");
    }
    setDeleting(false);
  };

  return <DeleteAccountView state={state} error={error} deleting={deleting} onConfirm={confirm} />;
}
