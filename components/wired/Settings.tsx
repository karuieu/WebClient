"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { API_URL, JSON_HEADERS, apiFetch, deletionErrorText } from "@/lib/api";
import { updateUser } from "@/lib/session";
import {
  changePassword,
  createRecoveryPhrase,
  deleteAllData,
  disableTwoFactor,
  enableTwoFactor,
  getRecoveryStatus,
  getDeleteChecks,
  setDeleteChecks,
  type DeleteChecks,
  getTwoFactorStatus,
  maskEmail,
  NAME_MAX_CHARS,
  regenerateBackupCodes,
  requestAccountDeletion,
  sendTwoFactorEmailCode,
  setupTwoFactor,
  updateProfile,
  type RecoveryStatus,
  type TwoFactorStatus,
} from "@/lib/auth";
import { getBillingStatus, type BillingStatus } from "@/lib/chat";
import { getChatTitleMode, setChatTitleMode, type ChatTitleMode } from "@/lib/chatTitle";
import { getArtifactsEnabled, setArtifactsEnabled } from "@/lib/artifacts";
import { getTabNamesEnabled, setTabNamesEnabled } from "@/lib/tabTitle";
import { CUSTOM_INSTRUCTIONS_MAX_CHARS, getCustomInstructionsDoc, saveCustomInstructions } from "@/lib/customInstructions";
import {
  ALL_PROVIDERS,
  PROVIDERS,
  PRO_ONLY_PROVIDERS,
  getProvider,
  getProviderSettings,
  setProviderSettings,
  type ProviderId,
  type ProviderSettings,
} from "@/lib/providers";
import {
  createMemoryCategory,
  createMemoryFile,
  deleteMemoryCategory,
  deleteMemoryFile,
  getMemorySettings,
  getMemoryTree,
  getPendingMemoryChats,
  isMemoryRefreshRunning,
  refreshMemory,
  renameMemoryCategory,
  setMemorySettings,
  updateMemoryFile,
  type MemoryCategory,
  type MemorySettings as MemoryPrefsState,
} from "@/lib/memory";
import { closedSettingsHref, isSettingsTab, settingsHref, SETTINGS_PARAM } from "@/lib/settingsOverlay";
import { addConnector, loadConnectors, removeConnector, updateConnector, type UserConnector } from "@/lib/userConnectors";
import { getToolApprovalMode, setToolApprovalMode, type ToolApprovalMode } from "@/lib/toolApproval";
import {
  createSkill,
  deleteSkill,
  listSkills,
  setSkillEnabled,
  SKILL_COUNT_LIMIT,
  SKILL_LIMITS,
  updateSkill,
  type Skill,
} from "@/lib/skills";
import { offerDraft } from "@/lib/draftRescue";
import { SettingsDialog, type SettingsTab } from "@/components/app/settings/SettingsDialog";
import { GeneralSettings } from "@/components/app/settings/General";
import { UsageSettings } from "@/components/app/settings/Usage";
import { MemoryFiles, MemorySettings } from "@/components/app/settings/Memory";
import { ProvidersSettings, type ProviderOption } from "@/components/app/settings/Providers";
import { ConnectorsSettings, type ConnectorItem } from "@/components/app/settings/Connectors";
import { SkillsSettings } from "@/components/app/settings/Skills";
import { BillingSettings } from "@/components/app/settings/Billing";
import { DangerSettings } from "@/components/app/settings/Danger";
import {
  BackupCodesDialog,
  ChangePasswordDialog,
  RecoveryPhraseDialog,
  SecuritySettings,
  TwoFactorConfirmDialog,
  TwoFactorSetupDialog,
  type ChangePasswordErrors,
  type TwoFactorSetupStep,
} from "@/components/app/settings/Security";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
const COMMIT = process.env.NEXT_PUBLIC_COMMIT;
const BUILD_COMMIT = COMMIT ? { hash: COMMIT.slice(0, 7), url: `https://github.com/karuieu/WebClient/commit/${COMMIT}` } : undefined;

async function billingCall<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const resp = await apiFetch(`${API_URL}${path}`, { method, headers: JSON_HEADERS });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}

function GeneralSection() {
  const { user } = useSession();
  const { showSuccess, showError } = useToast();
  const [instructions, setInstructions] = React.useState("");
  const [titleMode, setTitleMode] = React.useState<ChatTitleMode>("ai");
  const [artifacts, setArtifacts] = React.useState(true);
  const [tabNames, setTabNames] = React.useState(false);
  const [busy, setBusy] = React.useState<"profile" | "instructions" | null>(null);

  React.useEffect(() => {
    setTitleMode(getChatTitleMode());
    setArtifacts(getArtifactsEnabled());
    setTabNames(getTabNamesEnabled());
    getCustomInstructionsDoc()
      .then((doc) => setInstructions(doc.content))
      .catch(() => {});
  }, []);

  return (
    <GeneralSettings
      displayName={user?.display_name ?? ""}
      fullName={user?.full_name ?? ""}
      nameMax={NAME_MAX_CHARS}
      savingProfile={busy === "profile"}
      onSaveProfile={async (displayName, fullName) => {
        setBusy("profile");
        try {
          updateUser(await updateProfile(displayName, fullName));
          showSuccess("Profile updated");
        } catch {
          showError("Failed to update profile");
        } finally {
          setBusy(null);
        }
      }}
      instructions={instructions}
      instructionsMax={CUSTOM_INSTRUCTIONS_MAX_CHARS}
      savingInstructions={busy === "instructions"}
      onSaveInstructions={async (text) => {
        setBusy("instructions");
        try {
          setInstructions((await saveCustomInstructions(text)).content);
          showSuccess("Instructions saved");
        } catch {
          showError("Failed to save instructions");
        } finally {
          setBusy(null);
        }
      }}
      titleMode={titleMode}
      onTitleMode={(m) => {
        setTitleMode(m);
        setChatTitleMode(m);
      }}
      artifacts={artifacts}
      onArtifacts={(v) => {
        setArtifacts(v);
        setArtifactsEnabled(v);
      }}
      tabNames={tabNames}
      onTabNames={(v) => {
        setTabNames(v);
        setTabNamesEnabled(v);
      }}
      version={APP_VERSION}
      commit={BUILD_COMMIT}
    />
  );
}

function UsageSection({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useSession();
  const [billing, setBilling] = React.useState<BillingStatus | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getBillingStatus()
      .then(setBilling)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pro = (user?.tier ?? billing?.tier ?? "free") === "pro";
  return (
    <UsageSettings
      plan={pro ? "pro" : "free"}
      window={{
        label: pro ? "This 5-hour window" : "Today",
        used: billing?.tokens_used ?? 0,
        limit: billing?.tokens_limit ?? (pro ? 800_000 : 10_000),
        resetAt: billing?.window_reset_at ?? null,
      }}
      week={
        pro
          ? {
              label: "This week",
              used: billing?.week_tokens_used ?? 0,
              limit: billing?.week_tokens_limit ?? 3_200_000,
              resetAt: billing?.week_reset_at ?? null,
            }
          : undefined
      }
      loading={loading}
      onUpgrade={onUpgrade}
    />
  );
}

function MemorySection({ onOpenFiles }: { onOpenFiles: () => void }) {
  const { showSuccess, showError } = useToast();
  const [prefs, setPrefs] = React.useState<MemoryPrefsState>(() => getMemorySettings());
  const [pending, setPending] = React.useState<number | undefined>(undefined);
  const [refreshing, setRefreshing] = React.useState<{ batch: number; total: number } | null>(null);

  const loadPending = React.useCallback(
    () =>
      getPendingMemoryChats()
        .then((rows) => setPending(rows.filter((r) => !r.project_id).reduce((n, r) => n + r.unprocessed_user_messages, 0)))
        .catch(() => setPending(undefined)),
    [],
  );

  React.useEffect(() => {
    if (isMemoryRefreshRunning()) setRefreshing({ batch: 0, total: 0 });
    loadPending();
  }, [loadPending]);

  React.useEffect(() => {
    const onUpdated = () => {
      loadPending();
      setTimeout(() => {
        if (!isMemoryRefreshRunning()) setRefreshing(null);
      }, 0);
    };
    window.addEventListener("karui-memory-updated", onUpdated);
    return () => window.removeEventListener("karui-memory-updated", onUpdated);
  }, [loadPending]);

  return (
    <MemorySettings
      prefs={prefs}
      onPrefs={(patch) => {
        setPrefs(setMemorySettings(patch));
      }}
      onOpenFiles={onOpenFiles}
      pending={pending}
      refreshing={refreshing}
      onRefresh={async () => {
        if (refreshing || isMemoryRefreshRunning()) return;
        setRefreshing({ batch: 0, total: 0 });
        try {
          const result = await refreshMemory(({ batch, totalBatches }) => setRefreshing({ batch, total: totalBatches }));
          showSuccess(result ? "Memory updated" : "Nothing new to remember");
        } catch (error) {
          showError(error instanceof Error ? error.message : "Memory refresh failed");
        } finally {
          setRefreshing(null);
          loadPending();
        }
      }}
    />
  );
}

function MemoryFilesSection() {
  const { showSuccess, showError } = useToast();
  const [prefs, setPrefs] = React.useState<MemoryPrefsState>(() => getMemorySettings());
  const [tree, setTree] = React.useState<MemoryCategory[] | null>(null);

  React.useEffect(() => {
    getMemoryTree()
      .then(setTree)
      .catch(() => {
        setTree([]);
        showError("Failed to load memory");
      });
    const onUpdated = () => getMemoryTree().then(setTree).catch(() => {});
    window.addEventListener("karui-memory-updated", onUpdated);
    return () => window.removeEventListener("karui-memory-updated", onUpdated);
  }, [showError]);

  const patchFiles = (fn: (c: MemoryCategory) => MemoryCategory) => setTree((t) => (t ?? []).map(fn));

  return (
    <MemoryFiles
      categories={
        tree &&
        tree.map((c) => ({
          id: c.id,
          name: c.name,
          undecryptable: c.undecryptable,
          files: c.files.map((f) => ({ id: f.id, name: f.name, description: f.description, content: f.content, undecryptable: f.undecryptable })),
        }))
      }
      off={!prefs.enabled}
      onTurnOn={() => setPrefs(setMemorySettings({ enabled: true }))}
      actions={{
        createCategory: async (name) => {
          try {
            const category = await createMemoryCategory(name.trim());
            setTree((t) => [...(t ?? []), category]);
          } catch {
            showError("Failed to create category");
          }
        },
        renameCategory: async (id, name) => {
          try {
            await renameMemoryCategory(id, name.trim());
            patchFiles((c) => (c.id === id ? { ...c, name: name.trim() } : c));
          } catch {
            showError("Failed to rename category");
          }
        },
        deleteCategory: async (id) => {
          try {
            await deleteMemoryCategory(id);
            setTree((t) => (t ?? []).filter((c) => c.id !== id));
          } catch (error) {
            showError(deletionErrorText(error, "Failed to delete category"));
          }
        },
        createFile: async (categoryId, name, description) => {
          try {
            const file = await createMemoryFile(categoryId, name.trim(), description.trim(), "");
            patchFiles((c) => (c.id === categoryId ? { ...c, files: [...c.files, file] } : c));
          } catch {
            showError("Failed to create file");
          }
        },
        updateFile: async (id, patch) => {
          try {
            const read = tree?.flatMap((c) => c.files).find((f) => f.id === id)?.updatedAt;
            const updated = await updateMemoryFile(id, patch.name.trim(), patch.description.trim(), patch.content, read);
            patchFiles((c) => ({ ...c, files: c.files.map((f) => (f.id === id ? updated : f)) }));
            showSuccess("File saved");
          } catch (error) {
            showError(error instanceof Error ? error.message : "Failed to save file");
          }
        },
        deleteFile: async (id) => {
          try {
            await deleteMemoryFile(id);
            patchFiles((c) => ({ ...c, files: c.files.filter((f) => f.id !== id) }));
          } catch (error) {
            showError(deletionErrorText(error, "Failed to delete file"));
          }
        },
      }}
    />
  );
}

const VERIFICATION: Record<ProviderId, string> = {
  nearai: "hardware verified in your browser",
  phala: "hardware verified in your browser",
};

function ProvidersSection() {
  const { user } = useSession();
  const tier = user?.tier ?? "free";
  const [settings, setSettings] = React.useState<ProviderSettings>(() => getProviderSettings());
  const update = (patch: Partial<ProviderSettings>) => setSettings(setProviderSettings(patch));

  const providers: ProviderOption[] = ALL_PROVIDERS.map((id) => ({
    id,
    name: PROVIDERS[id].name,
    description: PROVIDERS[id].description,
    region: PROVIDERS[id].tag,
    verification: VERIFICATION[id],
    models: PROVIDERS[id].models.map((m) => ({ name: m.name, tier: m.tier })),
    links: PROVIDERS[id].links,
    locked: PRO_ONLY_PROVIDERS.has(id) && tier !== "pro",
  }));

  return (
    <ProvidersSettings
      providers={providers}
      provider={getProvider()}
      onProvider={(id) => update({ provider: id as ProviderId })}
      autoSearch={settings.autoWebSearch}
      onAutoSearch={(v) => update({ autoWebSearch: v })}
    />
  );
}

type Subscription = { tier: string; started_at?: string; expires_at?: string };

function toConnectorItem(c: UserConnector): ConnectorItem {
  return {
    id: c.id,
    name: c.name,
    description: "",
    url: c.url,
    browser: true,
    abilities: c.tools.map((t) => ({ label: t.title || t.name, changes: !t.readOnly })),
    status: "connected",
    route: c.route,
    custom: true,
  };
}

function ConnectorsSection({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useSession();
  const { showError } = useToast();
  const [connectors, setConnectors] = React.useState<UserConnector[] | null>(null);
  const [approval, setApproval] = React.useState<ToolApprovalMode>(() => getToolApprovalMode());

  React.useEffect(() => {
    loadConnectors()
      .then(setConnectors)
      .catch(() => setConnectors([]));
  }, []);

  const locked = (user?.tier ?? "free") !== "pro";
  if (!locked && connectors === null) return null;

  return (
    <ConnectorsSettings
      locked={locked}
      onUpgrade={onUpgrade}
      connectors={(connectors ?? []).map(toConnectorItem)}
      approval={{
        mode: approval,
        onChange: (mode) => {
          setToolApprovalMode(mode);
          setApproval(mode);
        },
      }}
      discover={false}
      serverRoute={false}
      onAdd={async (c) => {
        const added = await addConnector(c);
        setConnectors((list) => [...(list ?? []), added]);
      }}
      onRoute={(id, route) => {
        updateConnector(id, { route })
          .then(setConnectors)
          .catch(() => showError("Couldn't save that change"));
      }}
      onDisconnect={(id) => {
        removeConnector(id)
          .then(setConnectors)
          .catch(() => showError("Couldn't remove the connector"));
      }}
    />
  );
}

function BillingSection() {
  const { user, refreshUser } = useSession();
  const { showSuccess, showError } = useToast();
  const [subscription, setSubscription] = React.useState<Subscription | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"portal" | "cancel" | "reactivate" | null>(null);
  const pro = (user?.tier ?? "free") === "pro";

  React.useEffect(() => {
    billingCall<Subscription>("/api/billing/subscription")
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const change = async (kind: "cancel" | "reactivate") => {
    setBusy(kind);
    try {
      await billingCall(`/api/billing/${kind}`, "POST");
      showSuccess(kind === "cancel" ? "Plan cancelled. You keep Pro until the end of this billing period." : "Welcome back. Your plan will renew as usual.");
      await refreshUser().catch(() => {});
    } catch (error) {
      showError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <BillingSettings
      plan={pro ? "pro" : "free"}
      price={pro ? "€18 / month" : "€0 / month"}
      startedAt={pro ? subscription?.started_at : null}
      renewsAt={pro ? subscription?.expires_at : null}
      cancelAtPeriodEnd={user?.cancel_at_period_end ?? false}
      loading={loading}
      openingPortal={busy === "portal"}
      cancelling={busy === "cancel"}
      reactivating={busy === "reactivate"}
      onOpenPortal={async () => {
        setBusy("portal");
        // Open the tab synchronously so popup blockers treat it as user-initiated.
        const tab = window.open("about:blank", "_blank");
        try {
          const { portal_url } = await billingCall<{ portal_url?: string }>("/api/billing/portal");
          if (!portal_url) throw new Error("Failed to open the billing portal");
          if (tab) {
            tab.opener = null;
            tab.location.href = portal_url;
          } else window.location.href = portal_url;
        } catch (error) {
          tab?.close();
          const msg = error instanceof Error ? error.message : "";
          showError(msg === "no billing account yet" ? "Nothing here yet. Invoices appear after your first payment." : msg || "Failed to open the billing portal");
        } finally {
          setBusy(null);
        }
      }}
      onCancel={() => change("cancel")}
      onReactivate={() => change("reactivate")}
    />
  );
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

function SecuritySection() {
  const { showSuccess, showError } = useToast();
  const { user } = useSession();
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [passwordErrors, setPasswordErrors] = React.useState<ChangePasswordErrors>({});
  const [emailState, setEmailState] = React.useState<"idle" | "sending" | "sent">("idle");
  const [status, setStatus] = React.useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = React.useState<{ step: TwoFactorSetupStep; secret?: string; uri?: string; codes?: string[] } | null>(null);
  const [confirm, setConfirm] = React.useState<"off" | "codes" | null>(null);
  const [newCodes, setNewCodes] = React.useState<string[] | null>(null);
  const [recovery, setRecovery] = React.useState<RecoveryStatus | null>(null);
  const [phrase, setPhrase] = React.useState<{ words?: string[]; replacing: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [checks, setChecks] = React.useState<DeleteChecks | null>(null);

  const load = React.useCallback(() => {
    // Turning two-factor off moves code checks to the password on the server, so these reload with it.
    getDeleteChecks()
      .then(setChecks)
      .catch(() => setChecks(null));
    getTwoFactorStatus()
      .then(setStatus)
      .catch(() => setStatus({ available: false, enabled: false, backup_codes_left: 0 }));
    getRecoveryStatus()
      .then(setRecovery)
      .catch(() => setRecovery(null));
  }, []);
  React.useEffect(() => load(), [load]);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SecuritySettings
        twoFactor={
          status && { enabled: status.enabled, enabledAt: status.enabled_at, backupCodesLeft: status.backup_codes_left }
        }
        onSetUp={() => {
          setError(null);
          setSetup({ step: "password" });
        }}
        onTurnOff={() => {
          setError(null);
          setConfirm("off");
        }}
        onNewCodes={() => {
          setError(null);
          setConfirm("codes");
        }}
        recovery={recovery && { enabled: recovery.enabled, createdAt: recovery.created_at }}
        deleteChecks={checks}
        onDeleteChecks={async (next) => {
          try {
            await setDeleteChecks(next);
            setChecks(next);
          } catch (e) {
            showError(errorText(e, "Couldn't save this setting"));
          }
        }}
        onCreateRecovery={() => {
          setError(null);
          setPhrase({ replacing: !!recovery?.enabled });
        }}
        onChangePassword={async () => {
          setPasswordErrors({});
          // Wait for two-factor status before opening the dialog so a required code field cannot be omitted.
          const current = await getTwoFactorStatus().catch(() => null);
          if (!current) return showError("Couldn't check two-factor. Please try again.");
          setStatus(current);
          setPasswordOpen(true);
        }}
      />
      <ChangePasswordDialog
        open={passwordOpen}
        twoFactor={!!status?.enabled}
        errors={passwordErrors}
        loading={busy}
        onSubmit={async (v) => {
          if (v.password.length < 8) return setPasswordErrors({ password: "Password must be at least 8 characters" });
          if (v.password !== v.confirm) return setPasswordErrors({ confirm: "Passwords do not match" });
          setPasswordErrors({});
          setBusy(true);
          const result = await changePassword(v.current, v.password, status?.enabled ? { code: v.code, method: v.source } : undefined).catch(
            (e): { error: string; field?: undefined } => ({ error: errorText(e, "Couldn't change the password") })
          );
          setBusy(false);
          if (!result.error) {
            setPasswordOpen(false);
            showSuccess("Password changed.");
          } else if (result.field) setPasswordErrors({ [result.field]: result.error });
          else showError(result.error);
        }}
        onClose={() => setPasswordOpen(false)}
      />
      <RecoveryPhraseDialog
        open={phrase !== null}
        step={phrase?.words ? "phrase" : "password"}
        words={phrase?.words}
        replacing={phrase?.replacing}
        error={error}
        loading={busy}
        onPassword={(password) =>
          run(async () => {
            const words = await createRecoveryPhrase(password, !!phrase?.replacing);
            setPhrase((p) => p && { ...p, words });
            load();
          }, "Couldn't make a recovery phrase")
        }
        onClose={() => {
          if (phrase?.words) showSuccess("Recovery phrase saved.");
          setPhrase(null);
          setError(null);
        }}
      />
      <TwoFactorSetupDialog
        open={setup !== null}
        step={setup?.step ?? "password"}
        uri={setup?.uri}
        secret={setup?.secret}
        backupCodes={setup?.codes}
        error={error}
        loading={busy}
        onPassword={(password) =>
          run(async () => {
            const { secret, uri } = await setupTwoFactor(password);
            setSetup({ step: "scan", secret, uri });
          }, "Couldn't start two-factor setup")
        }
        onVerify={(code) =>
          run(async () => {
            const codes = await enableTwoFactor(code);
            setSetup({ step: "codes", codes });
            load();
          }, "Couldn't turn on two-factor")
        }
        onClose={() => {
          if (setup?.step === "codes") showSuccess("Two-factor is on.");
          setSetup(null);
          setError(null);
        }}
      />
      <TwoFactorConfirmDialog
        open={confirm !== null}
        kind={confirm ?? "off"}
        error={error}
        loading={busy}
        emailHint={user?.email ? maskEmail(user.email) : undefined}
        emailSending={emailState === "sending"}
        emailSent={emailState === "sent"}
        onSendEmailCode={async () => {
          setEmailState("sending");
          setError(null);
          try {
            await sendTwoFactorEmailCode();
            setEmailState("sent");
          } catch (e) {
            setError(errorText(e, "Couldn't send the code"));
            setEmailState((s) => (s === "sending" ? "idle" : s));
          }
        }}
        onConfirm={(code, source) =>
          run(async () => {
            if (confirm === "off") {
              await disableTwoFactor(code, source);
              showSuccess("Two-factor is off.");
            } else {
              setNewCodes(await regenerateBackupCodes(code, source));
            }
            setEmailState("idle");
            setConfirm(null);
            load();
          }, "Couldn't confirm it's you")
        }
        onClose={() => {
          setConfirm(null);
          setError(null);
          setEmailState("idle");
        }}
      />
      <BackupCodesDialog open={newCodes !== null} codes={newCodes ?? []} onClose={() => setNewCodes(null)} />
    </>
  );
}

function DangerSection() {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [busy, setBusy] = React.useState<"data" | "account" | null>(null);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [accountError, setAccountError] = React.useState<string | null>(null);
  const [requested, setRequested] = React.useState(false);

  return (
    <DangerSettings
      deletingData={busy === "data"}
      dataError={dataError}
      onDeleteData={async (password) => {
        setBusy("data");
        setDataError(null);
        try {
          await deleteAllData(password);
          window.dispatchEvent(new CustomEvent("karui-reload-chats"));
          showSuccess("All data deleted. Your account is still active.");
          router.replace("/new");
        } catch (error) {
          setDataError(error instanceof Error ? error.message : "Failed to delete data");
        } finally {
          setBusy(null);
        }
      }}
      requestingAccount={busy === "account"}
      accountError={accountError}
      accountRequested={requested}
      onRequestAccountDeletion={async (password) => {
        setBusy("account");
        setAccountError(null);
        try {
          await requestAccountDeletion(password);
          setRequested(true);
        } catch (error) {
          setAccountError(error instanceof Error ? error.message : "Failed to send the confirmation email");
        } finally {
          setBusy(null);
        }
      }}
    />
  );
}

const CREATE_SKILL_STARTER = "Help me write a skill:";

function SkillsSection({ onCreateWithKarui }: { onCreateWithKarui: () => void }) {
  const { user } = useSession();
  const { showSuccess, showError } = useToast();
  const [skills, setSkills] = React.useState<Skill[] | null>(null);

  React.useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch(() => {
        setSkills([]);
        showError("Failed to load skills");
      });
  }, [showError]);

  const put = (skill: Skill) =>
    setSkills((all) => [...(all ?? []).filter((s) => s.id !== skill.id), skill].sort((a, b) => a.name.localeCompare(b.name)));

  return (
    <SkillsSettings
      skills={skills}
      limits={{ ...SKILL_LIMITS, skills: SKILL_COUNT_LIMIT[user?.tier === "pro" ? "pro" : "free"] }}
      onCreate={async (fields) => {
        try {
          put(await createSkill(fields));
          showSuccess("Skill saved");
        } catch (error) {
          showError(error instanceof Error ? error.message : "Failed to save skill");
        }
      }}
      onUpdate={async (id, fields) => {
        try {
          put(await updateSkill(id, fields, skills?.find((s) => s.id === id)?.updatedAt));
          showSuccess("Skill saved");
        } catch (error) {
          showError(error instanceof Error ? error.message : "Failed to save skill");
        }
      }}
      onToggle={async (id, enabled) => {
        try {
          put(await setSkillEnabled(id, enabled));
        } catch {
          showError("Failed to update skill");
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteSkill(id);
          setSkills((all) => (all ?? []).filter((s) => s.id !== id));
        } catch (error) {
          showError(deletionErrorText(error, "Failed to delete skill"));
        }
      }}
      onCreateWithKarui={onCreateWithKarui}
    />
  );
}

export function SettingsOverlay() {
  const router = useRouter();
  const { user } = useSession();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get(SETTINGS_PARAM);
  const open = isSettingsTab(requested);
  const [tab, setTab] = React.useState<SettingsTab>(open ? requested : "general");

  React.useEffect(() => {
    if (isSettingsTab(requested)) setTab(requested);
  }, [requested]);

  const close = () => router.replace(closedSettingsHref(pathname, params), { scroll: false });
  const upgrade = () => router.push("/plans");
  const createSkillWithKarui = () => {
    offerDraft(CREATE_SKILL_STARTER);
    router.push("/new");
  };

  const showTab = (t: SettingsTab) => {
    setTab(t);
    router.replace(settingsHref(pathname, t, params), { scroll: false });
  };

  return (
    <SettingsDialog
      open={open}
      tab={tab}
      onTab={showTab}
      onClose={close}
      badges={(user?.tier ?? "free") === "pro" ? undefined : { connectors: "Pro" }}
      sections={{
        general: <GeneralSection />,
        usage: <UsageSection onUpgrade={upgrade} />,
        memory: <MemorySection onOpenFiles={() => showTab("your-memory")} />,
        providers: <ProvidersSection />,
        connectors: <ConnectorsSection onUpgrade={upgrade} />,
        skills: <SkillsSection onCreateWithKarui={createSkillWithKarui} />,
        "your-memory": <MemoryFilesSection />,
        billing: <BillingSection />,
        security: <SecuritySection />,
        danger: <DangerSection />,
      }}
    />
  );
}
