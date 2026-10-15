"use client";

import { Button } from "@/components/kit/Button";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { cx } from "@/lib/cx";
import { FormAlert } from "./FormAlert";

export function CheckEmailView({
  email,
  resending,
  resent,
  error,
  onResend,
  onBack,
}: {
  email: string;
  resending?: boolean;
  resent?: boolean;
  error?: string | null;
  onResend?: () => void;
  onBack?: () => void;
}) {
  return (
    <div>
      <Rise>
        <Label>Verify email</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">Check your inbox.</h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
          We sent a link to <span className="break-all font-medium text-fg">{email}</span>. Open it to finish creating
          your account. It expires in an hour.
        </p>
      </Rise>
      <Rise delay={0.2}>
        <div className="mt-10">
          <FormAlert message={error} />
          <div className={cx("flex flex-wrap items-center gap-3", error && "mt-4")}>
            {onResend && (
              <Button variant="secondary" size="lg" loading={resending} disabled={resent} onClick={onResend}>
                {resent ? "Link sent again" : "Didn't get it? Resend"}
              </Button>
            )}
            {onBack && (
              <Button variant="ghost" size="lg" onClick={onBack}>
                Use a different email
              </Button>
            )}
          </div>
        </div>
      </Rise>
    </div>
  );
}
