"use client";

import { useEffect, useState } from "react";
import { StatusView } from "@/components/auth/StatusView";
import { SIGN_IN_CHANNEL } from "@/lib/connectors/mcpOAuth";

type Status = "working" | "success" | "error";

// The sign-in window lands here. The code goes to the tab that started the sign-in, the only one holding the PKCE
// verifier, and the address is cleared so the code doesn't stay in history.
export default function ConnectorCallbackPage() {
  const [status, setStatus] = useState<Status>("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channel = new BroadcastChannel(SIGN_IN_CHANNEL);
    channel.postMessage({
      state: params.get("state"),
      code: params.get("code"),
      error: params.get("error"),
      description: params.get("error_description"),
    });
    channel.close();
    window.history.replaceState(null, "", window.location.pathname);
    setStatus(params.get("code") ? "success" : "error");
    window.close();
  }, []);

  return (
    <StatusView
      label="Connectors"
      state={status}
      title={status === "working" ? "Finishing sign-in…" : status === "success" ? "You're signed in" : "Sign-in didn't finish"}
      text={status === "working" ? null : "You can close this window and go back to Karui."}
    />
  );
}
