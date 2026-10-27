"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { updateProfile, completeOnboarding, loadOnboardingRecovery, saveOnboardingRecovery, NAME_MAX_CHARS } from "@/lib/account/auth";
import { updateUser } from "@/lib/account/session";
import { DEFAULT_PROVIDER, PROVIDERS, setProviderSettings, type ProviderId } from "@/lib/models/providers";
import { setMemorySettings, DEFAULT_MEMORY_SETTINGS } from "@/lib/chat/memory";
import { API_URL, apiFetch } from "@/lib/core/api";
import { OnboardingView, onboardingSteps, type OnboardingValues } from "@/components/onboarding/OnboardingView";

const PROVIDER_OPTIONS: { id: ProviderId; model: string }[] = [
  { id: "phala", model: "Gemma 4 31B" },
  { id: "nearai", model: "GLM 5.3 Flash" },
];

const PLANS = [
  {
    tier: "free" as const,
    name: "Free",
    price: "€0",
    limits: "30,000 tokens a day, roughly 5 messages. Our system prompt is on us.",
    highlight: "Light model",
  },
  {
    tier: "pro" as const,
    name: "Pro",
    price: "€18 / month",
    limits: "800,000 tokens per 5 hours, up to 3.2 million a week.",
    highlight: "All models · priority access",
  },
];

const RECOVERY_STEP = 6;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useSession();
  const { showError } = useToast();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryWords, setRecoveryWords] = useState<string[] | null>(null);
  const [recoveryStored, setRecoveryStored] = useState(false);
  const [values, setValues] = useState<OnboardingValues>({
    displayName: user?.display_name ?? "",
    fullName: user?.full_name ?? "",
    provider: DEFAULT_PROVIDER,
    autoWebSearch: true,
    memory: DEFAULT_MEMORY_SETTINGS.enabled,
    recoverySaved: false,
    plan: "free",
    startNow: false,
  });

  useEffect(() => {
    loadOnboardingRecovery()
      .then(setRecoveryWords)
      .catch(() => setRecoveryWords(null));
  }, []);

  const onChange = (patch: Partial<OnboardingValues>) => setValues((v) => ({ ...v, ...patch }));

  const go = (dir: 1 | -1) => {
    setDirection(dir);
    setError(null);
    setStep((s) => Math.min(onboardingSteps(!!recoveryWords), Math.max(1, s + dir)));
  };

  const handleNext = async () => {
    if (step === RECOVERY_STEP && recoveryWords && !recoveryStored) {
      setIsSaving(true);
      setError(null);
      const result = await saveOnboardingRecovery();
      setIsSaving(false);
      if (result.gone) {
        setRecoveryWords(null);
        showError(result.error ?? "Couldn't save the phrase");
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      setRecoveryStored(true);
    }
    go(1);
  };

  const handleFinish = async () => {
    setIsSaving(true);
    setError(null);
    try {
      setProviderSettings({
        provider: values.provider as ProviderId,
        autoWebSearch: values.autoWebSearch,
      });
      setMemorySettings({ enabled: values.memory });

      const display = values.displayName.trim();
      const full = values.fullName.trim() || display;
      const updated = await updateProfile(display, full);
      updateUser(updated);

      await completeOnboarding();
      await refreshUser();

      if (values.plan === "free") {
        router.replace("/new");
        return;
      }

      const resp = await apiFetch(`${API_URL}/api/billing/checkout?plan=${values.plan}&start_now=true`);
      const data = (await resp.json().catch(() => ({}))) as { checkout_url?: unknown; error?: unknown };
      const url = typeof data.checkout_url === "string" ? data.checkout_url : "";
      if (!resp.ok || !url.startsWith("https://")) {
        showError(typeof data.error === "string" ? data.error : "Could not start checkout — you can upgrade later in settings.");
        router.replace("/new");
        return;
      }
      window.location.href = url;
    } catch {
      setError("Could not finish setup. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <OnboardingView
      step={step}
      direction={direction}
      values={values}
      onChange={onChange}
      onBack={() => go(-1)}
      onNext={() => void handleNext()}
      onFinish={handleFinish}
      saving={isSaving}
      error={error}
      nameMax={NAME_MAX_CHARS}
      providers={PROVIDER_OPTIONS.map((o) => ({
        id: o.id,
        name: PROVIDERS[o.id].name,
        model: o.model,
      }))}
      plans={PLANS}
      recoveryPhrase={recoveryWords}
    />
  );
}
