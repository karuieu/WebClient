"use client";

import { useState } from "react";
import { forgotPassword } from "@/lib/account/auth";
import { prefetchCaptcha } from "@/lib/account/captcha";
import { CaptchaCheckbox } from "@/components/auth/CaptchaCheckbox";
import { ForgotPasswordView } from "@/components/auth/ForgotPasswordView";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    const result = await forgotPassword(email.trim());
    if (result.success) setSent(true);
    else setError(result.error || "Couldn't send the link");
    setLoading(false);
  };

  const handleResend = async () => {
    if (resendState === "sending") return;
    setResendState("sending");
    await forgotPassword(email.trim());
    setResendState("sent");
  };

  return (
    <ForgotPasswordView
      email={email}
      sent={sent}
      error={error}
      loading={loading}
      resending={resendState === "sending"}
      resent={resendState === "sent"}
      captcha={<CaptchaCheckbox />}
      onChange={(value) => {
        prefetchCaptcha();
        setEmail(value);
      }}
      onSubmit={handleSubmit}
      onResend={handleResend}
    />
  );
}
