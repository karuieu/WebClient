"use client";

import Link from "next/link";
import { LANDING_URL } from "@/app/siteUrl";
import { Button } from "@/components/kit/Button";
import { Checkbox, Field } from "@/components/kit/Field";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { FormAlert, PendingStatus } from "./FormAlert";

export type RegisterValues = { email: string; password: string; confirm: string; terms?: boolean };
export type RegisterErrors = Partial<Record<keyof RegisterValues | "form", string | null>>;

export function RegisterView({
  values,
  errors = {},
  loading,
  status,
  passwordHint = "At least 8 characters.",
  showTerms = false,
  loginHref = "/login",
  captcha,
  onChange,
  onSubmit,
}: {
  values: RegisterValues;
  errors?: RegisterErrors;
  loading?: boolean;
  status?: string | null;
  passwordHint?: React.ReactNode;
  showTerms?: boolean;
  loginHref?: string;

  captcha?: React.ReactNode;
  onChange: <K extends keyof RegisterValues>(field: K, value: RegisterValues[K]) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <Rise>
        <Label>Create account</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">Private from the first message.</h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
          Free to start. No card needed.
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
          <FormAlert message={errors.form} />

          <Field
            id="email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={values.email}
            error={errors.email}
            onChange={(e) => onChange("email", e.target.value)}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            value={values.password}
            error={errors.password}
            hint={passwordHint}
            onChange={(e) => onChange("password", e.target.value)}
          />
          <Field
            id="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={values.confirm}
            error={errors.confirm}
            onChange={(e) => onChange("confirm", e.target.value)}
          />

          {showTerms && (
          <div className="flex flex-col gap-2">
            <Checkbox
              id="terms"
              checked={!!values.terms}
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={errors.terms ? "terms-error" : undefined}
              onChange={(e) => onChange("terms", e.target.checked)}
            >
              I agree to the{" "}
              <Link href={`${LANDING_URL}/terms`} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-4">
                Terms
              </Link>{" "}
              and the{" "}
              <Link href={`${LANDING_URL}/privacy`} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </Checkbox>
            {errors.terms && (
              <p id="terms-error" role="alert" className="pl-[30px] text-[0.8125rem] text-danger">
                {errors.terms}
              </p>
            )}
          </div>
          )}

          {captcha}

          <div className="mt-3 flex flex-col gap-3">
            <Button type="submit" size="lg" arrow loading={loading} className="w-full">
              Create account
            </Button>
            <PendingStatus text={loading ? status : null} />
          </div>
        </form>
      </Rise>

      <Rise delay={0.24}>
        <p className="mt-6 border-t border-line pt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-fg underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </Rise>
    </div>
  );
}
