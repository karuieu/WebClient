"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { LANDING_URL, PRICING_URL } from "@/app/siteUrl";
import { API_URL, JSON_HEADERS, apiFetch } from "@/lib/core/api";
import { LOGIN_FOR_UPGRADE_PATH } from "@/lib/account/afterLogin";
import { UpgradeView } from "@/components/app/UpgradeView";

function Upgrade() {
  const { isInitialized, isLoggedIn, user, refreshUser } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const { showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [checkout, setCheckout] = useState<"confirming" | "pending" | "done" | null>(null);
  const [startNow, setStartNow] = useState(false);
  const [startNowError, setStartNowError] = useState<string | null>(null);
  const current = user?.tier === "pro" ? "pro" : "free";

  useEffect(() => {
    if (isInitialized && !isLoggedIn) router.replace(LOGIN_FOR_UPGRADE_PATH);
  }, [isInitialized, isLoggedIn, router]);

  useEffect(() => {
    if (params.get("success") !== "true") return;
    setCheckout("confirming");
    router.replace("/upgrade");
    let cancelled = false;

    // Polar's webhook can land after the buyer is back, so the plan is asked for a few times.
    (async () => {
      for (const delay of [0, 1500, 4000]) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        await refreshUser().catch(() => {});
      }
      if (!cancelled) setCheckout((c) => (c === "confirming" ? "pending" : c));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if ((checkout === "confirming" || checkout === "pending") && current === "pro") setCheckout("done");
  }, [checkout, current]);

  const startCheckout = async () => {
    if (loading) return;
    if (!startNow) {
      setStartNowError("Tick the box to continue to payment.");
      return;
    }
    setLoading(true);
    try {
      const resp = await apiFetch(`${API_URL}/api/billing/checkout?plan=pro&start_now=true`, { headers: JSON_HEADERS });
      const data = (await resp.json().catch(() => ({}))) as { checkout_url?: unknown; error?: unknown };
      if (!resp.ok) {
        showError(typeof data.error === "string" ? data.error : "Couldn't start checkout. Please try again.");
        return;
      }
      const url = typeof data.checkout_url === "string" ? data.checkout_url : "";
      if (!url.startsWith("https://")) {
        showError("The checkout link looks invalid. Please try again.");
        return;
      }
      window.location.href = url;
    } catch {
      showError("Couldn't reach Karui. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isInitialized || !isLoggedIn) return null;

  return (
    <UpgradeView
      price="€18"
      period="per month + VAT"
      current={current}
      loading={loading}
      checkout={checkout}
      plansHref={PRICING_URL}
      termsHref={`${LANDING_URL}/terms`}
      settingsHref="/new?settings=billing"
      homeHref="/new"
      onContinue={startCheckout}
      startNow={startNow}
      startNowError={startNowError}
      onStartNow={(checked) => {
        setStartNow(checked);
        if (checked) setStartNowError(null);
      }}
    />
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <Upgrade />
    </Suspense>
  );
}
