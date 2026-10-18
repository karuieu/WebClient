"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { API_URL, JSON_HEADERS, apiFetch } from "@/lib/api";
import { PlansView, type PlanCard } from "@/components/app/PlansView";

const PLANS: PlanCard[] = [
  {
    tier: "free",
    name: "Free",
    price: "€0",
    period: "forever",
    line: "To try Karui and ask the occasional question.",
    note: "10,000 tokens a day, roughly 5 messages",
    features: ["End-to-end encryption", "Light model", "Advanced Memory & one project", "Web search, 10 a day", "Artifacts & images"],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "€18",
    period: "per month + VAT",
    line: "For everyday use.",
    note: "800,000 tokens per 5 hours, up to 3.2 million a week, by model cost",
    features: [
      "Everything in Free",
      "Heavy and every other model",
      "Your choice of provider",
      "Unlimited projects, longer conversations",
      "50 web searches a day",
      "Bring your own MCP connectors",
    ],
  },
];

function Plans() {
  const { user, refreshUser } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const { showError } = useToast();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<"confirming" | "pending" | "done" | null>(null);
  const [startNow, setStartNow] = useState(false);
  const [startNowError, setStartNowError] = useState<string | null>(null);
  const current = user?.tier === "pro" ? "pro" : "free";

  useEffect(() => {
    if (params.get("success") !== "true") return;
    setCheckout("confirming");
    router.replace("/plans");
    let cancelled = false;

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

  const choose = async (tier: "free" | "pro") => {
    if (loadingTier || tier === "free") return;
    if (!startNow) {
      setStartNowError("Tick the box to continue to payment.");
      return;
    }
    setLoadingTier(tier);
    try {
      const resp = await apiFetch(`${API_URL}/api/billing/checkout?plan=${tier}&start_now=true`, { headers: JSON_HEADERS });
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
      setLoadingTier(null);
    }
  };

  return (
    <PlansView
      plans={PLANS}
      current={current}
      loadingTier={loadingTier}
      checkout={checkout}
      settingsHref="/plans?settings=billing"
      onChoose={choose}
      startNow={startNow}
      startNowError={startNowError}
      onStartNow={(checked) => {
        setStartNow(checked);
        if (checked) setStartNowError(null);
      }}
    />
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={null}>
      <Plans />
    </Suspense>
  );
}
