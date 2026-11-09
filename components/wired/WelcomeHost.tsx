"use client";

import * as React from "react";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { WelcomeDialog, type WelcomeStep } from "@/components/app/WelcomeDialog";
import { completeFirstRun, loadFirstRecovery, saveFirstRecovery } from "@/lib/account/auth";
import { deletePendingRecovery, isFirstRun } from "@/lib/account/session";
import { DEFAULT_MEMORY_SETTINGS, setMemorySettings } from "@/lib/chat/memory";

export function WelcomeHost({ onMemoryChange }: { onMemoryChange: () => void }): React.JSX.Element | null {
  const { user, refreshUser } = useSession();
  const { showError } = useToast();
  const firstRun = isFirstRun(user);
  const [ready, setReady] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const [words, setWords] = React.useState<string[] | null>(null);
  const [step, setStep] = React.useState<WelcomeStep>("phrase");
  const [memory, setMemory] = React.useState(DEFAULT_MEMORY_SETTINGS.enabled);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!firstRun) return;
    loadFirstRecovery()
      .catch(() => null)
      .then((found) => {
        setWords(found);
        setStep(found ? "phrase" : "memory");
        setReady(true);
      });
  }, [firstRun]);

  if (!firstRun || !ready) return null;

  const savePhrase = async () => {
    setSaving(true);
    setError(null);
    const result = await saveFirstRecovery();
    setSaving(false);
    if (result.gone) showError(result.error ?? "Couldn't save the phrase");
    else if (result.error) return setError(result.error);
    setStep("memory");
  };

  const skipPhrase = () => {
    void deletePendingRecovery();
    setStep("memory");
  };

  const finish = async () => {
    setOpen(false);
    setMemorySettings({ enabled: memory });
    onMemoryChange();
    try {
      await completeFirstRun();
      await refreshUser();
    } catch {
      // Not marked done (e.g. a banned account is refused): the dialog comes back on the next visit, which is harmless.
    }
  };

  return (
    <WelcomeDialog
      open={open}
      step={step}
      words={words}
      memory={memory}
      onMemory={setMemory}
      saving={saving}
      error={error}
      onSavePhrase={() => void savePhrase()}
      onSkipPhrase={skipPhrase}
      onFinish={() => void finish()}
    />
  );
}
