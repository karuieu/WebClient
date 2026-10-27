"use client";

import { useState } from "react";
import { register, resendVerificationEmail } from "@/lib/account/auth";
import { prefetchCaptcha } from "@/lib/account/captcha";
import { useRedirectIfLoggedIn } from "@/components/SessionProvider";
import { CaptchaCheckbox } from "@/components/auth/CaptchaCheckbox";
import { CheckEmailView } from "@/components/auth/CheckEmailView";
import { RegisterView, type RegisterErrors, type RegisterValues } from "@/components/auth/RegisterView";
import { StatusView } from "@/components/auth/StatusView";
import { useAuthControls } from "@/components/auth/useAuthControls";

export default function RegisterPage() {
  const redirecting = useRedirectIfLoggedIn();
  const controls = useAuthControls();
  const [values, setValues] = useState<RegisterValues>({ email: "", password: "", confirm: "", terms: false });
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrors({});
    if (values.password.length < 8) {
      setErrors({ password: "Password must be at least 8 characters" });
      return;
    }
    if (values.password !== values.confirm) {
      setErrors({ confirm: "Passwords do not match" });
      return;
    }
    if (!values.terms) {
      setErrors({ terms: "Please accept the Terms and the Privacy Policy" });
      return;
    }
    setIsLoading(true);
    const result = await register(values.email, values.password);
    if (result.success) {
      setPendingEmail(result.email || values.email);
    } else {
      setErrors({ form: result.error || "Registration failed" });
    }
    setIsLoading(false);
  };

  const handleResend = async () => {
    if (!pendingEmail || resendState === "sending") return;
    setResendError(null);
    setResendState("sending");
    const result = await resendVerificationEmail(pendingEmail);
    setResendState(result.success ? "sent" : "idle");
    if (!result.success) setResendError(result.error || "Could not resend the email.");
  };

  if (redirecting) return null;

  if (controls?.registration_enabled === false) {
    return <StatusView label="Create account" state="error" title="Registrations are paused." text="Creating an account is temporarily unavailable. Please try again later." />;
  }

  if (pendingEmail) {
    return (
      <CheckEmailView
        email={pendingEmail}
        resending={resendState === "sending"}
        resent={resendState === "sent"}
        error={resendError}
        onResend={handleResend}
        onBack={() => {
          setPendingEmail(null);
          setResendState("idle");
          setResendError(null);
        }}
      />
    );
  }

  return (
    <RegisterView
      values={values}
      errors={errors}
      loading={isLoading}
      showTerms
      captcha={<CaptchaCheckbox />}
      onChange={(field, value) => {
        prefetchCaptcha();
        setValues((v) => ({ ...v, [field]: value }));
      }}
      onSubmit={handleSubmit}
    />
  );
}
