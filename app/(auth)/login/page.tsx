"use client";

import { useState } from "react";
import { login, loginWithCode, maskEmail, sendLoginEmailCode } from "@/lib/account/auth";
import { prefetchCaptcha } from "@/lib/account/captcha";
import { useRedirectIfLoggedIn } from "@/components/SessionProvider";
import { LoginView, type LoginValues } from "@/components/auth/LoginView";
import { CaptchaCheckbox } from "@/components/auth/CaptchaCheckbox";
import { TwoFactorView, type TwoFactorMode } from "@/components/auth/TwoFactorView";
import { StatusView } from "@/components/auth/StatusView";
import { useAuthControls } from "@/components/auth/useAuthControls";

export default function LoginPage() {
  const redirecting = useRedirectIfLoggedIn();
  const controls = useAuthControls();
  const [values, setValues] = useState<LoginValues>({ email: "", password: "", remember: false });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [mode, setMode] = useState<TwoFactorMode>("app");
  const [code, setCode] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setIsLoading(true);
    const result = await login(values.email, values.password, values.remember);
    if (result.success) {
      window.location.href = "/new";
      return;
    }
    if (result.twoFactorChallenge) {
      setChallenge(result.twoFactorChallenge);
      setMode("app");
      setCode("");
    } else {
      setError(result.error || "Login failed");
    }
    setIsLoading(false);
  };

  const submitCode = async (value: string) => {
    if (!challenge || !value.trim() || isLoading) return;
    setError("");
    setIsLoading(true);
    const result = await loginWithCode(challenge, value, values.password, values.remember, mode);
    if (result.success) {
      window.location.href = "/new";
      return;
    }
    if (result.challengeExpired) setChallenge(null);
    setError(result.error || "Login failed");
    setCode("");
    setIsLoading(false);
  };

  const sendEmailCode = async () => {
    if (!challenge || emailSending) return;
    setError("");
    setEmailSending(true);
    const result = await sendLoginEmailCode(challenge);
    if (!result.success) {
      if (result.challengeExpired) setChallenge(null);
      setError(result.error || "Couldn't send the code");
    }
    setEmailSending(false);
  };

  if (redirecting) return null;

  if (controls?.login_enabled === false) {
    return <StatusView label="Sign in" state="error" title="Karui is paused." text="Sign-in is temporarily unavailable. Please try again later." />;
  }

  if (challenge) {
    return (
      <TwoFactorView
        mode={mode}
        code={code}
        error={error || null}
        loading={isLoading}
        emailHint={maskEmail(values.email)}
        emailSending={emailSending}
        onChange={(value) => {
          const digits = mode !== "backup";
          const next = digits ? value.replace(/\D/g, "").slice(0, 6) : value;
          setCode(next);

          if (digits && next.length === 6) void submitCode(next);
        }}
        onSubmit={() => void submitCode(code)}
        onResendEmail={() => void sendEmailCode()}
        onModeChange={(m) => {
          setMode(m);
          setCode("");
          setError("");
          if (m === "email") void sendEmailCode();
        }}
        onBack={() => {
          setChallenge(null);
          setError("");
        }}
      />
    );
  }

  return (
    <LoginView
      values={values}
      errors={{ form: error || null }}
      loading={isLoading}
      captcha={<CaptchaCheckbox />}
      onChange={(field, value) => {
        prefetchCaptcha();
        setValues((v) => ({ ...v, [field]: value }));
      }}
      onSubmit={handleSubmit}
    />
  );
}
