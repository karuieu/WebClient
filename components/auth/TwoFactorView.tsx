"use client";

import { Button } from "@/components/kit/Button";
import { Field } from "@/components/kit/Field";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { FormAlert } from "./FormAlert";

export type TwoFactorMode = "app" | "backup" | "email";

const linkClass = "cursor-pointer font-medium text-fg underline-offset-4 hover:underline";

const asideClass =
  "cursor-pointer font-sans text-[0.8125rem] text-muted underline-offset-4 hover:text-fg hover:underline disabled:cursor-default disabled:opacity-45";

export function TwoFactorView({
  mode,
  code,
  error,
  loading,
  emailHint,
  emailSending,
  onChange,
  onSubmit,
  onModeChange,
  onResendEmail,
  onBack,
}: {
  mode: TwoFactorMode;
  code: string;
  error?: string | null;
  loading?: boolean;
  emailHint?: string;
  emailSending?: boolean;
  onChange: (code: string) => void;
  onSubmit: () => void;
  onModeChange: (mode: TwoFactorMode) => void;
  onResendEmail?: () => void;
  onBack: () => void;
}) {
  const digits = mode !== "backup";
  const lead =
    mode === "app"
      ? "Enter the 6-digit code from your authenticator app."
      : mode === "backup"
        ? "Enter one of the backup codes you saved when you turned on two-factor."
        : emailSending
          ? `Sending a code to ${emailHint ?? "your email"}…`
          : `We sent a 6-digit code to ${emailHint ?? "your email"}. It signs you in and turns off two-factor, so you can set it up again on a new phone.`;

  return (
    <div>
      <Rise>
        <Label index="02">Sign in</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">{mode === "email" ? "Check your email." : "One more step."}</h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">{lead}</p>
      </Rise>

      <Rise delay={0.18}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="mt-10 flex flex-col gap-5"
        >
          <FormAlert message={error} />

          <Field
            key={mode}
            id="two-factor-code"
            label={mode === "app" ? "Code" : mode === "backup" ? "Backup code" : "Code from email"}
            labelAside={
              mode === "email" ? (
                <button type="button" onClick={onResendEmail} disabled={emailSending} className={asideClass}>
                  Send a new code
                </button>
              ) : (
                <button type="button" onClick={() => onModeChange("email")} className={asideClass}>
                  Lost your phone?
                </button>
              )
            }
            inputMode={digits ? "numeric" : "text"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            maxLength={digits ? 6 : 11}
            placeholder={digits ? "000000" : "xxxxx-xxxxx"}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono"
          />

          <div className="mt-3 flex flex-col gap-3">
            <Button type="submit" size="lg" arrow loading={loading} className="w-full">
              Continue
            </Button>
          </div>
        </form>
      </Rise>

      <Rise delay={0.24}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-6 text-sm">
          <button type="button" onClick={() => onModeChange(mode === "app" ? "backup" : "app")} className={linkClass}>
            {mode === "app" ? "Use a backup code" : "Use your authenticator app"}
          </button>
          <button type="button" onClick={onBack} className="cursor-pointer text-muted underline-offset-4 hover:text-fg hover:underline">
            Back
          </button>
        </div>
      </Rise>
    </div>
  );
}
