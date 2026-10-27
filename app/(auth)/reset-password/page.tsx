"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiHttpError, completePasswordReset, startPasswordReset, type PasswordResetStart } from "@/lib/account/auth";
import { takeLinkToken } from "@/lib/account/linkToken";
import { StatusView } from "@/components/auth/StatusView";
import { ResetPasswordView, type ResetErrors, type ResetMode, type ResetValues } from "@/components/auth/ResetPasswordView";

const LABEL = "Reset password";

export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={<StatusView label={LABEL} state="working" title="Opening your link…" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const params = useSearchParams();
  const done = params.get("done");

  useEffect(() => {
    if (done !== "phrase" && done !== "fresh") return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, [done]);

  if (done === "phrase" || done === "fresh") return <ResetDone mode={done} />;
  return <ResetForm />;
}

function ResetDone({ mode }: { mode: ResetMode }) {
  return (
    <StatusView
      label={LABEL}
      state="success"
      title="Password changed."
      text={
        mode === "phrase"
          ? "Your chats are just as you left them. You've been signed out everywhere else."
          : "Your account starts fresh. You've been signed out everywhere else."
      }
      action={{ href: "/login", label: "Sign in" }}
    />
  );
}

function ResetForm() {
  const [token, setToken] = useState<string | undefined>(undefined);
  const [start, setStart] = useState<PasswordResetStart | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [mode, setMode] = useState<ResetMode>("phrase");
  const [values, setValues] = useState<ResetValues>({ phrase: "", password: "", confirm: "", understood: false });
  const [errors, setErrors] = useState<ResetErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const found = takeLinkToken();
    setToken((prev) => prev ?? found ?? "");
  }, []);

  useEffect(() => {
    if (token === undefined) return;
    if (token === "") {
      setLinkError("This link is missing its token. Open it straight from the email.");
      return;
    }
    startPasswordReset(token)
      .then((s) => {
        setStart(s);
        if (!s.recovery_envelope) setMode("fresh");
      })
      .catch((e) => setLinkError(e instanceof Error ? e.message : "This link is invalid or has expired."));
  }, [token]);

  const handleSubmit = async () => {
    if (!start || !token) return;
    setErrors({});
    if (values.password.length < 8) {
      setErrors({ password: "Password must be at least 8 characters" });
      return;
    }
    if (values.password !== values.confirm) {
      setErrors({ confirm: "Passwords do not match" });
      return;
    }
    setLoading(true);
    try {
      await completePasswordReset(token, start, mode, values.phrase, values.password);
      // Reload to clear revoked session caches and remove the spent reset token from browser history.
      window.location.replace(`/reset-password?done=${mode}`);
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 410) setLinkError(e.message);
      else setErrors({ form: e instanceof Error ? e.message : "Couldn't reset the password" });
      setLoading(false);
    }
  };

  if (linkError) {
    return (
      <StatusView
        label={LABEL}
        state="error"
        title="That link didn't work."
        text={linkError}
        action={{ href: "/forgot-password", label: "Ask for a new link" }}
      />
    );
  }
  if (!start) return <StatusView label={LABEL} state="working" title="Opening your link…" />;

  return (
    <ResetPasswordView
      mode={mode}
      values={values}
      errors={errors}
      loading={loading}
      onModeChange={(m) => {
        setMode(m);
        setErrors({});
      }}
      onChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
      onSubmit={handleSubmit}
    />
  );
}
