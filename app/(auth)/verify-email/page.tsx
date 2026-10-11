"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { verifyEmail } from "@/lib/auth";
import { StatusView } from "@/components/auth/StatusView";
import { useAuthControls } from "@/components/auth/useAuthControls";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<StatusView label="Verify email" state="working" title="Confirming your email…" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const controls = useAuthControls();
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
