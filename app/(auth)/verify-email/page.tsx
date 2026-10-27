"use client";

import { useEffect, useState } from "react";
import { verifyEmail } from "@/lib/account/auth";
import { takeLinkToken } from "@/lib/account/linkToken";
import { StatusView } from "@/components/auth/StatusView";
import { useAuthControls } from "@/components/auth/useAuthControls";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage(): React.JSX.Element {
  const controls = useAuthControls();
  const [token, setToken] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    const found = takeLinkToken();
    setToken((prev) => prev ?? found ?? "");
  }, []);

  useEffect(() => {
    if (token === undefined) return;
    if (token === "") {
      setStatus("error");
      setError("Missing verification token.");
      return;
    }
    verifyEmail(token).then((result) => {
      if (result.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setError(result.error || "This link is invalid or has expired.");
      }
    });
  }, [token]);

  if (controls?.registration_enabled === false) {
    return <StatusView label="Verify email" state="error" title="Registrations are paused." text="Try again after registrations resume. This link expires after one hour." />;
  }
  if (status === "verifying") return <StatusView label="Verify email" state="working" title="Confirming your email…" />;
  if (status === "success")
    return (
      <StatusView
        label="Verify email"
        state="success"
        title="Email confirmed."
        text="Your account is ready. Sign in to get started."
        action={{ href: "/login", label: "Continue to sign in" }}
      />
    );
  return (
    <StatusView
      label="Verify email"
      state="error"
      title="That link didn't work."
      text={error}
      action={{ href: "/register", label: "Back to sign up" }}
    />
  );
}
