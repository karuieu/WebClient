"use client";

import { planOf } from "@/lib/account/plan";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { LANDING_URL, PRICING_URL } from "@/app/siteUrl";
import { API_URL, JSON_HEADERS, apiFetch } from "@/lib/core/api";
import { LOGIN_FOR_MAX_PATH, LOGIN_FOR_UPGRADE_PATH, MAX_UPGRADE_PATH, asksForMax } from "@/lib/account/afterLogin";
import { UpgradeView } from "@/components/app/UpgradeView";

const PRICES = { pro: "€18", max: "€50" };

function Upgrade() {
  const { isInitialized, isLoggedIn, user, refreshUser } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const { showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [checkout, setCheckout] = useState<"confirming" | "pending" | "done" | null>(null);
  const [startNow, setStartNow] = useState(false);
  const [startNowError, setStartNowError] = useState<string | null>(null);
  const current = planOf(user?.tier);
  const wantsMax = asksForMax(params);
  const plan = current === "max" || wantsMax ? "max" : "pro";
  const upgrading = current === "pro" && plan === "max";

  useEffect(() => {
    if (isInitialized && !isLoggedIn) router.replace(wantsMax ? LOGIN_FOR_MAX_PATH : LOGIN_FOR_UPGRADE_PATH);
  }, [isInitialized, isLoggedIn, router, wantsMax]);

  const isMounted = useRef(false);
  const returnHandled = useRef(false);

  // The loop below must outlive the params change that router.replace causes, so only leaving the page stops it.
  // Strict Mode runs this effect twice, hence the flag is raised in the body and dropped in the cleanup.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (params.get("success") !== "true" || returnHandled.current) return;
    returnHandled.current = true;
    setCheckout("confirming");
    router.replace(wantsMax ? MAX_UPGRADE_PATH : "/upgrade");

    // Polar's webhook can land after the buyer is back, so the plan is asked for a few times.
    (async () => {
      for (const delay of [0, 1500, 4000]) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (!isMounted.current) return;
        await refreshUser().catch(() => {});
      }
      if (isMounted.current) setCheckout((c) => (c === "confirming" ? "pending" : c));
    })();
  }, [params, router, refreshUser, wantsMax]);

  useEffect(() => {
    if ((checkout === "confirming" || checkout === "pending") && current === plan) setCheckout("done");
  }, [checkout, current, plan]);

  const openCheckout = async () => {
    const resp = await apiFetch(`${API_URL}/api/billing/checkout?plan=${plan}&start_now=true`, { headers: JSON_HEADERS });
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
  };

  const upgradeToMax = async () => {
    const resp = await apiFetch(`${API_URL}/api/billing/upgrade?start_now=true`, { method: "POST", headers: JSON_HEADERS });
    if (!resp.ok) {
      const data = (await resp.json().catch(() => ({}))) as { error?: unknown };
      showError(typeof data.error === "string" ? data.error : "Couldn't upgrade your plan. Please try again.");
      return;
    }
    setCheckout("confirming");
    await refreshUser().catch(() => {});
    setCheckout((c) => (c === "confirming" ? "pending" : c));
  };

  const startPurchase = async () => {
    if (loading) return;
    if (!startNow) {
      setStartNowError(upgrading ? "Tick the box to upgrade." : "Tick the box to continue to payment.");
      return;
    }
    setLoading(true);
    try {
      await (upgrading ? upgradeToMax() : openCheckout());
    } catch {
      showError("Couldn't reach Karui. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isInitialized || !isLoggedIn) return null;

  return (
    <UpgradeView
      plan={plan}
      price={PRICES[plan]}
      period="per month + VAT"
      current={current}
      loading={loading}
      checkout={checkout}
      plansHref={PRICING_URL}
      termsHref={`${LANDING_URL}/terms`}
      settingsHref="/new?settings=billing"
      homeHref="/new"
      onContinue={startPurchase}
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
