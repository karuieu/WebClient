"use client";

import * as React from "react";
import { Button, ButtonLink } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { ArrowUpRight } from "@/components/kit/icons";
import { Group, Row } from "./Layout";

export type BillingSettingsProps = {
  plan: "free" | "pro";
  price: string;
  startedAt?: string | null;
  renewsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  loading?: boolean;
  openingPortal?: boolean;
  cancelling?: boolean;
  reactivating?: boolean;
  onOpenPortal: () => void;
  onCancel: () => void;
  onReactivate: () => void;
};

const date = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : "—";

export function BillingSettings(p: BillingSettingsProps) {
  const [confirm, setConfirm] = React.useState<"cancel" | "reactivate" | null>(null);
  const pro = p.plan === "pro";

  React.useEffect(() => {
    if (!p.cancelling && !p.reactivating) setConfirm(null);
  }, [p.cancelling, p.reactivating]);

  return (
    <>
      <section className="rounded-2xl border border-line bg-elevated p-6">
        <p className="text-label text-muted">Current plan</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[2rem] font-medium leading-none tracking-[-0.035em]">{pro ? "Pro" : "Free"}</p>
            <p className="mt-2 font-mono text-[12px] text-muted">{p.price}</p>
          </div>
          {!pro && (
            <ButtonLink href="/plans" arrow>
              See Pro
            </ButtonLink>
          )}
        </div>

        {pro && (
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
            <div className="bg-elevated px-4 py-3">
              <dt className="text-label text-muted">Member since</dt>
              <dd className="mt-2 text-[14px]">{p.loading ? "—" : date(p.startedAt)}</dd>
            </div>
            <div className="bg-elevated px-4 py-3">
              <dt className="text-label text-muted">{p.cancelAtPeriodEnd ? "Ends on" : "Renews on"}</dt>
              <dd className="mt-2 text-[14px]">{p.loading ? "—" : date(p.renewsAt)}</dd>
            </div>
          </dl>
        )}
      </section>

      {pro && p.cancelAtPeriodEnd && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface px-5 py-4">
          <p className="max-w-[26rem] text-pretty text-[13.5px] leading-relaxed text-muted">
            Your plan won&apos;t renew. You keep Pro until {date(p.renewsAt)}, then switch to Free.
          </p>
          <Button variant="secondary" onClick={() => setConfirm("reactivate")}>
            Keep Pro
          </Button>
        </div>
      )}

      <Group title="Payments" footer="Payments and invoices are handled by Polar. Karui never sees your card details.">
        <Row
          label="Invoices and payment method"
          control={
            <Button variant="secondary" loading={p.openingPortal} onClick={p.onOpenPortal}>
              Open portal
              <ArrowUpRight className="size-3.5" />
            </Button>
          }
        />
        {pro && !p.cancelAtPeriodEnd && (
          <Row
            label="Cancel plan"
            control={
              <button
                type="button"
                onClick={() => setConfirm("cancel")}
                className="h-9 cursor-pointer rounded-full px-4 text-[13.5px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
              >
                Cancel plan
              </button>
            }
          />
        )}
      </Group>

      <Dialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title="Cancel Pro?"
        description={`You'll keep Pro until ${date(p.renewsAt)}. After that your account switches to Free, and nothing in it is deleted.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} data-autofocus>
              Keep Pro
            </Button>
            <Button variant="danger" loading={p.cancelling} onClick={p.onCancel}>
              Cancel plan
            </Button>
          </>
        }
      />
      <Dialog
        open={confirm === "reactivate"}
        onClose={() => setConfirm(null)}
        title="Keep Pro?"
        description="Your plan will renew automatically at the end of this period."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Not now
            </Button>
            <Button loading={p.reactivating} onClick={p.onReactivate}>
              Keep Pro
            </Button>
          </>
        }
      />
    </>
  );
}
