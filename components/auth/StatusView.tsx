"use client";

import { ButtonLink } from "@/components/kit/Button";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { Spinner } from "@/components/kit/Spinner";
import { cx } from "@/lib/cx";

export function StatusView({
  label,
  state,
  title,
  text,
  action,
}: {
  label: string;
  state: "working" | "success" | "error";
  title: string;
  text?: string | null;
  action?: { href: string; label: string };
}) {
  return (
    <div aria-live="polite">
      <Rise>
        <Label>{label}</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 flex items-center gap-4 text-balance">
          {state === "working" && <Spinner className="size-6 border-2" />}
          <span className={cx(state === "working" && "text-shimmer")}>{title}</span>
        </h1>
      </Rise>
      {text && (
        <Rise delay={0.12}>
          <p className={cx("mt-4 text-pretty text-[1.0625rem] leading-relaxed", state === "error" ? "text-fg/80" : "text-muted")}>{text}</p>
        </Rise>
      )}
      {action && state !== "working" && (
        <Rise delay={0.18}>
          <ButtonLink href={action.href} size="lg" variant={state === "success" ? "primary" : "secondary"} arrow className="mt-10">
            {action.label}
          </ButtonLink>
        </Rise>
      )}
    </div>
  );
}
