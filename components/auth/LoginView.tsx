"use client";

import Link from "next/link";
import { Button } from "@/components/kit/Button";
import { Checkbox, Field } from "@/components/kit/Field";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { FormAlert, PendingStatus } from "./FormAlert";

export type LoginValues = { email: string; password: string; remember: boolean };
export type LoginErrors = Partial<Record<keyof LoginValues | "form", string | null>>;

export function LoginView({
  values,
  errors = {},
  loading,
  status,
  notice,
  registerHref = "/register",
  forgotHref = "/forgot-password",
  captcha,
  onChange,
  onSubmit,
}: {
  values: LoginValues;
  errors?: LoginErrors;
  loading?: boolean;
  status?: string | null;
  notice?: React.ReactNode;
  registerHref?: string;
  forgotHref?: string;

  captcha?: React.ReactNode;
  onChange: <K extends keyof LoginValues>(field: K, value: LoginValues[K]) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <Rise>
        <Label index="01">Sign in</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">Welcome back.</h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
          Your chats unlock on this device, after you sign in.
        </p>
      </Rise>

      {notice && (
        <Rise delay={0.16} className="mt-8">
          {notice}
        </Rise>
      )}

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
            labelAside={
              <Link href={forgotHref} className="text-[0.8125rem] text-muted underline-offset-4 hover:text-fg hover:underline">
                Forgot password?
              </Link>
            }
            type="password"
            autoComplete="current-password"
            required
            value={values.password}
            error={errors.password}
            onChange={(e) => onChange("password", e.target.value)}
          />
          <Checkbox id="remember" checked={values.remember} onChange={(e) => onChange("remember", e.target.checked)}>
            <span className="text-fg">Keep me signed in</span>
            <span className="block text-[12.5px]">Recommended on trusted devices.</span>
          </Checkbox>

          {captcha}

          <div className="mt-3 flex flex-col gap-3">
            <Button type="submit" size="lg" arrow loading={loading} className="w-full">
              Sign in
            </Button>
            <PendingStatus text={loading ? status : null} />
          </div>
        </form>
      </Rise>

      <Rise delay={0.24}>
        <p className="mt-6 border-t border-line pt-6 text-sm text-muted">
          New to Karui?{" "}
          <Link href={registerHref} className="font-medium text-fg underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </Rise>
    </div>
  );
}
