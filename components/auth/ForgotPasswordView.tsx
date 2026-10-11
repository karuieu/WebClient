"use client";

import Link from "next/link";
import { Button, ButtonLink } from "@/components/kit/Button";
import { Field } from "@/components/kit/Field";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { FormAlert } from "./FormAlert";


export function ForgotPasswordView({
  email,
  sent,
  error,
  loading,
  resending,
  resent,
  captcha,
  loginHref = "/login",
  onChange,
  onSubmit,
  onResend,
}: {
  email: string;
  sent?: boolean;
  error?: string | null;
  loading?: boolean;
  resending?: boolean;
  resent?: boolean;

  captcha?: React.ReactNode;
  loginHref?: string;
  onChange: (email: string) => void;
  onSubmit: () => void;
  onResend: () => void;
}) {
  if (sent) {
    return (
      <div>
        <Rise>
          <Label index="04">Reset password</Label>
        </Rise>
        <Rise delay={0.06}>
          <h1 className="text-title mt-6 text-balance">Check your inbox.</h1>
        </Rise>
        <Rise delay={0.12}>
          <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
            If there&apos;s a Karui account for <span className="break-all font-medium text-fg">{email}</span>, we sent a link
            to reset the password. It expires in an hour.
          </p>
        </Rise>
        <Rise delay={0.2}>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="lg" loading={resending} disabled={resent} onClick={onResend}>
              {resent ? "Link sent again" : "Didn't get it? Resend"}
            </Button>
            <ButtonLink href={loginHref} variant="ghost" size="lg">
              Back to sign in
            </ButtonLink>
          </div>
        </Rise>
      </div>
    );
  }

  return (
    <div>
      <Rise>
        <Label index="04">Reset password</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">Forgot your password?</h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
          Enter your email and we&apos;ll send you a link to choose a new one.
        </p>
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
            id="forgot-email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            value={email}
            onChange={(e) => onChange(e.target.value)}
          />
          {captcha}
          <div className="mt-3">
            <Button type="submit" size="lg" arrow loading={loading} disabled={!email.trim()} className="w-full">
              Send link
            </Button>
          </div>
        </form>
      </Rise>

      <Rise delay={0.24}>
        <p className="mt-6 border-t border-line pt-6 text-sm text-muted">
          Remembered it?{" "}
          <Link href={loginHref} className="font-medium text-fg underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </Rise>
    </div>
  );
}
