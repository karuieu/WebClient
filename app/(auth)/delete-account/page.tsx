"use client";

import { useEffect, useState } from "react";
import { confirmAccountDeletion } from "@/lib/account/auth";
import { takeLinkToken } from "@/lib/account/linkToken";
import { clearSession } from "@/lib/account/session";
import { DeleteAccountView } from "@/components/auth/DeleteAccountView";

export default function DeleteAccountPage(): React.JSX.Element | null {
  const [token, setToken] = useState<string | undefined>(undefined);
  const [state, setState] = useState<"confirm" | "success" | "error">("confirm");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const found = takeLinkToken();
    setToken((prev) => prev ?? found ?? "");
  }, []);

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

  if (token === undefined) return null;
  return <DeleteAccountView state={token === "" ? "error" : state} error={token === "" ? "Missing confirmation token." : error} deleting={deleting} onConfirm={confirm} />;
}
