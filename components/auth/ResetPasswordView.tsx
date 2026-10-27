"use client";

import { Button, ButtonLink } from "@/components/kit/Button";
import { Field, TextAreaField } from "@/components/kit/Field";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { Segmented } from "@/components/kit/Segmented";
import { FormAlert } from "./FormAlert";

export type ResetMode = "phrase" | "support";
export type ResetValues = { phrase: string; password: string; confirm: string };
export type ResetErrors = Partial<Record<"form" | "password" | "confirm", string | null>>;

/**
 * Only the recovery phrase can reset the password; without it the screen points to support, because an emailed
 * link alone must not be enough to wipe the account.
 */
export function ResetPasswordView({
  mode,
  values,
  errors = {},
  loading,
  onModeChange,
  onChange,
  onSubmit,
}: {
  mode: ResetMode;
  values: ResetValues;
  errors?: ResetErrors;
  loading?: boolean;
  onModeChange: (mode: ResetMode) => void;
  onChange: <K extends keyof ResetValues>(field: K, value: ResetValues[K]) => void;
  onSubmit: () => void;
}) {
  const support = mode === "support";
  const canSubmit = !!values.password && !!values.confirm && !!values.phrase.trim();

  return (
    <div>
      <Rise>
        <Label>Reset password</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">Choose a new password.</h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
          {support
            ? "Without your recovery phrase, nothing can decrypt what you've stored, not even us."
            : "Your recovery phrase unlocks your chats again, so nothing is lost."}
        </p>
      </Rise>

      <Rise delay={0.18}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }}
          className="mt-10 flex flex-col gap-5"
        >
          <Segmented
            id="reset-mode"
            label="Recovery phrase"
            options={[
              { value: "phrase", label: "I have my recovery phrase" },
              { value: "support", label: "I don't have it" },
            ]}
            value={mode}
            onChange={onModeChange}
          />

          <FormAlert message={errors.form} />

          {support ? (
            <>
              <p className="rounded-2xl border border-line bg-surface px-4 py-3.5 text-pretty text-[13.5px] leading-relaxed">
                We can&apos;t reset your password without the phrase. Write to support@karui.eu from this email address.
              </p>
              <ButtonLink href="mailto:support@karui.eu" size="lg" variant="secondary" className="mt-3 w-full">
                Email support
              </ButtonLink>
            </>
          ) : (
            <>
              <TextAreaField
                id="reset-phrase"
                label="Recovery phrase"
                rows={3}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="12 words, separated by spaces"
                value={values.phrase}
                onChange={(e) => onChange("phrase", e.target.value)}
                className="font-mono"
              />
              <Field
                id="reset-password"
                label="New password"
                type="password"
                autoComplete="new-password"
                hint="At least 8 characters."
                value={values.password}
                error={errors.password}
                onChange={(e) => onChange("password", e.target.value)}
              />
              <Field
                id="reset-confirm"
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={values.confirm}
                error={errors.confirm}
                onChange={(e) => onChange("confirm", e.target.value)}
              />
              <div className="mt-3">
                <Button type="submit" size="lg" arrow loading={loading} disabled={!canSubmit} className="w-full">
                  Reset password
                </Button>
              </div>
            </>
          )}
        </form>
      </Rise>
    </div>
  );
}
