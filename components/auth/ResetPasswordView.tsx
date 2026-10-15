"use client";

import { Button } from "@/components/kit/Button";
import { Checkbox, Field, TextAreaField } from "@/components/kit/Field";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { Segmented } from "@/components/kit/Segmented";
import { FormAlert } from "./FormAlert";

export type ResetMode = "phrase" | "fresh";
export type ResetValues = { phrase: string; password: string; confirm: string; understood: boolean };
export type ResetErrors = Partial<Record<"form" | "password" | "confirm", string | null>>;

/**
 * Recovery phrases preserve encrypted chats; without one, reset creates a fresh account key and deletes
 * unreadable data.
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
  const fresh = mode === "fresh";
  const canSubmit = !!values.password && !!values.confirm && (fresh ? values.understood : !!values.phrase.trim());

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
          {fresh
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
              { value: "fresh", label: "I don't have it" },
            ]}
            value={mode}
            onChange={onModeChange}
          />

          <FormAlert message={errors.form} />

          {fresh ? (
            <p className="rounded-2xl border border-danger/35 bg-danger/[0.06] px-4 py-3.5 text-pretty text-[13.5px] leading-relaxed">
              Resetting deletes your chats, projects, memory and custom instructions. Your account, your plan and two-factor stay.
            </p>
          ) : (
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
          )}

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

          {fresh && (
            <Checkbox id="reset-understood" checked={values.understood} onChange={(e) => onChange("understood", e.target.checked)}>
              <span className="text-fg">I understand my chats and data will be deleted</span>
            </Checkbox>
          )}

          <div className="mt-3">
            <Button
              type="submit"
              size="lg"
              arrow={!fresh}
              variant={fresh ? "danger" : "primary"}
              loading={loading}
              disabled={!canSubmit}
              className="w-full"
            >
              {fresh ? "Reset and start fresh" : "Reset password"}
            </Button>
          </div>
        </form>
      </Rise>
    </div>
  );
}
