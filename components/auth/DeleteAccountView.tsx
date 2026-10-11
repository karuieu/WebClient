"use client";

import { Button, ButtonLink } from "@/components/kit/Button";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { StatusView } from "./StatusView";

/** Require explicit confirmation; mail scanners opening the link must not delete the account. */
export function DeleteAccountView({
  state,
  error,
  deleting,
  onConfirm,
}: {
  state: "confirm" | "success" | "error";
  error?: string | null;
  deleting?: boolean;
  onConfirm: () => void;
}) {
  if (state === "success")
    return (
      <StatusView
        label="Delete account"
        state="success"
        title="Account deleted."
        text="Your account and everything in it have been permanently deleted."
        action={{ href: "/", label: "Back to Karui" }}
      />
    );
  if (state === "error")
    return (
      <StatusView
        label="Delete account"
        state="error"
        title="That didn't work."
        text={error}
        action={{ href: "/new?settings=danger", label: "Back to settings" }}
      />
    );
  return (
    <div>
      <Rise>
        <Label>Delete account</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">Delete your account?</h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">
          Every chat, project and memory file goes with it, and a Pro plan ends right away. This can&apos;t be undone.
        </p>
      </Rise>
      <Rise delay={0.18}>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button variant="danger" size="lg" loading={deleting} onClick={onConfirm}>
            Delete my account
          </Button>
          <ButtonLink href="/new" size="lg" variant="secondary">
            Keep my account
          </ButtonLink>
        </div>
      </Rise>
    </div>
  );
}
