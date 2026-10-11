"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Checkbox, Field } from "@/components/kit/Field";
import { AlertCircle, Check, Copy, Download } from "@/components/kit/icons";
import { QrCode } from "@/components/kit/QrCode";
import { RecoveryPhrase } from "@/components/kit/RecoveryPhrase";
import { Segmented } from "@/components/kit/Segmented";
import { Group, Row, SectionIntro } from "./Layout";

export type TwoFactorStatus = { enabled: boolean; enabledAt?: string | null; backupCodesLeft?: number };
export type RecoveryStatus = { enabled: boolean; createdAt?: string | null };

function OnBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-[3px] font-mono text-[10.5px] leading-none text-fg">
      <span className="size-1.5 rounded-full bg-ok" />
      ON
    </span>
  );
}

export type DeleteAction = "chats" | "projects" | "memory" | "skills" | "library";
export type DeleteCheck = "none" | "password" | "two_factor";
export type DeleteChecks = Record<DeleteAction, DeleteCheck>;

const DELETE_ACTIONS: { id: DeleteAction; label: string }[] = [
  { id: "chats", label: "Chats" },
  { id: "projects", label: "Projects" },
  { id: "memory", label: "Memory" },
  { id: "skills", label: "Skills" },
  { id: "library", label: "Library files" },
];

const CHECK_TEXT: Record<DeleteCheck | "custom", string> = {
  none: "Deleting doesn't ask for anything.",
  password: "Deleting asks for your password.",
  two_factor: "Deleting asks for a code from your authenticator app.",
  custom: "Each kind of deletion asks for what you pick below.",
};

function checkOptions(twoFactorOn: boolean) {
  return [
    { value: "none" as const, label: "None" },
    { value: "password" as const, label: "Password" },
    { value: "two_factor" as const, label: "2FA", disabled: !twoFactorOn },
  ];
}

function DeleteChecksGroup({
  checks,
  twoFactorOn,
  onChange,
}: {
  checks: DeleteChecks | null;
  twoFactorOn: boolean;
  onChange: (checks: DeleteChecks) => void;
}) {
  const [customising, setCustomising] = React.useState(false);
  const values = checks ? new Set(Object.values(checks)) : null;
  const shared = values?.size === 1 ? [...values][0] : null;
  const mode = customising || !shared ? "custom" : shared;
  const setAll = (check: DeleteCheck) =>
    onChange(Object.fromEntries(DELETE_ACTIONS.map((a) => [a.id, check])) as DeleteChecks);

  return (
    <Group
      title="Ask before deleting"
      footer={`Karui's server checks this, so it holds even for someone who gets into your session. Once you confirm, deleting doesn't ask again for 5 minutes, and changing these settings asks you to confirm too.${twoFactorOn ? "" : " Turn on two-factor to use a code."}`}
    >
      <Row label="Deleting" description={CHECK_TEXT[mode]}>
        {checks && (
          <Segmented
            id="delete-checks"
            label="Ask before deleting"
            size="sm"
            className="sm:max-w-sm"
            options={[...checkOptions(twoFactorOn), { value: "custom" as const, label: "Custom" }]}
            value={mode}
            onChange={(v) => {
              setCustomising(v === "custom");
              if (v !== "custom") setAll(v);
            }}
          />
        )}
      </Row>
      {checks &&
        mode === "custom" &&
        DELETE_ACTIONS.map((action) => (
          <Row
            key={action.id}
            label={action.label}
            control={
              <Segmented
                id={`delete-check-${action.id}`}
                label={`Ask before deleting ${action.label.toLowerCase()}`}
                size="sm"
                options={checkOptions(twoFactorOn)}
                value={checks[action.id]}
                onChange={(v) => onChange({ ...checks, [action.id]: v })}
              />
            }
          />
        ))}
    </Group>
  );
}

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function SecuritySettings({
  twoFactor,
  recovery,
  onSetUp,
  onTurnOff,
  onNewCodes,
  onCreateRecovery,
  onChangePassword,
  deleteChecks,
  onDeleteChecks,
}: {
  /** null while loading. */
  twoFactor: TwoFactorStatus | null;
  /** null while loading. */
  recovery: RecoveryStatus | null;
  onSetUp: () => void;
  onTurnOff: () => void;
  onNewCodes: () => void;

  onCreateRecovery: () => void;
  onChangePassword: () => void;
  /** null while loading. */
  deleteChecks: DeleteChecks | null;
  onDeleteChecks: (checks: DeleteChecks) => void;
}) {
  const on = !!twoFactor?.enabled;
  const phrase = !!recovery?.enabled;

  return (
    <>
      <SectionIntro>
        Two-factor keeps a password that gets out from being enough on its own. A recovery phrase gets your chats back if you forget yours.
      </SectionIntro>

      <Group title="Password">
        <Row
          label="Password"
          description="Keeps your chats and recovery phrase. Signs out your other devices."
          control={
            <Button variant="secondary" onClick={onChangePassword}>
              Change
            </Button>
          }
        />
      </Group>

      <Group
        title="Two-factor authentication"
        footer={on ? "Keep your backup codes somewhere safe. Without them or your phone, we can't sign you in." : undefined}
      >
        <Row
          label={
            <span className="inline-flex items-center gap-2">
              Authenticator app
              {on && <OnBadge />}
            </span>
          }
          description={
            on
              ? twoFactor?.enabledAt
                ? `Turned on ${date(twoFactor.enabledAt)}.`
                : "Signing in asks for a code from your app."
              : "Ask for a code from an app like 2FAS, Aegis or Bitwarden when you sign in."
          }
          control={
            twoFactor === null ? null : on ? (
              <button
                type="button"
                onClick={onTurnOff}
                className="h-9 cursor-pointer rounded-full px-4 text-[13.5px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
              >
                Turn off
              </button>
            ) : (
              <Button variant="secondary" onClick={onSetUp}>
                Set up
              </Button>
            )
          }
        />
        {on && (
          <Row
            label="Backup codes"
            description={`${twoFactor?.backupCodesLeft ?? 0} of 10 left. Each one signs you in once without your phone.`}
            control={
              <Button variant="secondary" onClick={onNewCodes}>
                New codes
              </Button>
            }
          />
        )}
      </Group>

      <DeleteChecksGroup checks={deleteChecks} twoFactorOn={on} onChange={onDeleteChecks} />

      <Group title="Recovery phrase" footer="Anyone with the phrase and your email can reset your password. Keep it offline.">
        <Row
          label={
            <span className="inline-flex items-center gap-2">
              Recovery phrase
              {phrase && <OnBadge />}
            </span>
          }
          description={
            phrase && recovery?.createdAt
              ? `Created ${date(recovery.createdAt)}. Resets your password without losing your chats.`
              : "12 words that reset your password without losing your chats."
          }
          control={
            recovery === null ? null : (
              <Button variant="secondary" onClick={onCreateRecovery}>
                {phrase ? "Replace" : "Create"}
              </Button>
            )
          }
        />
      </Group>
    </>
  );
}


export function RecoveryPhraseDialog({
  open,
  step,
  words,
  replacing,
  error,
  loading,
  onPassword,
  onClose,
}: {
  open: boolean;
  step: "password" | "phrase";
  words?: string[];
  replacing?: boolean;
  error?: string | null;
  loading?: boolean;
  onPassword: (password: string) => void;
  onClose: () => void;
}) {
  const formId = React.useId();
  const [password, setPassword] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setPassword("");
      setSaved(false);
    }
  }, [open]);

  if (step === "phrase") {
    return (
      <Dialog
        open={open}
        onClose={() => saved && onClose()}
        title="Save your recovery phrase"
        description="These 12 words reset your password without losing your chats. This is the only time you'll see them."
        footer={
          <Button onClick={onClose} disabled={!saved}>
            Done
          </Button>
        }
      >
        <RecoveryPhrase words={words ?? []} />
        <Checkbox id="recovery-saved" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-5">
          <span className="text-fg">I&apos;ve saved my recovery phrase somewhere safe</span>
        </Checkbox>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={replacing ? "Replace your recovery phrase?" : "Create a recovery phrase"}
      description={replacing ? "Your current phrase stops working. Confirm your password to continue." : "Confirm your password to continue."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={loading} disabled={!password}>
            Continue
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          onPassword(password);
        }}
      >
        <Field
          id="recovery-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          data-autofocus
        />
      </form>
    </Dialog>
  );
}

export type ChangePasswordValues = { current: string; password: string; confirm: string; code: string; source: "app" | "backup" };
export type ChangePasswordErrors = Partial<Record<"current" | "password" | "confirm" | "code", string | null>>;
const EMPTY_PASSWORD_CHANGE: ChangePasswordValues = { current: "", password: "", confirm: "", code: "", source: "app" };

/** Rewrap the same AES key to preserve chats and recovery; require a second factor when enabled. */
export function ChangePasswordDialog({
  open,
  twoFactor,
  errors = {},
  loading,
  onSubmit,
  onClose,
}: {
  open: boolean;
  twoFactor?: boolean;
  errors?: ChangePasswordErrors;
  loading?: boolean;
  onSubmit: (values: ChangePasswordValues) => void;
  onClose: () => void;
}) {
  const formId = React.useId();
  const [v, setV] = React.useState(EMPTY_PASSWORD_CHANGE);
  const set = (patch: Partial<ChangePasswordValues>) => setV((x) => ({ ...x, ...patch }));

  React.useEffect(() => {
    if (!open) setV(EMPTY_PASSWORD_CHANGE);
  }, [open]);

  const digits = v.source === "app";
  const codeReady = !twoFactor || (digits ? v.code.length === 6 : !!v.code.trim());

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change your password"
      description="Your chats and recovery phrase stay as they are. You stay signed in here; other devices are signed out."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={loading} disabled={!v.current || !v.password || !v.confirm || !codeReady}>
            Change password
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(v);
        }}
      >
        <Field
          id={`${formId}-current`}
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={v.current}
          onChange={(e) => set({ current: e.target.value })}
          error={errors.current}
          data-autofocus
        />
        <Field
          id={`${formId}-new`}
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={v.password}
          onChange={(e) => set({ password: e.target.value })}
          error={errors.password}
        />
        <Field
          id={`${formId}-confirm`}
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={v.confirm}
          onChange={(e) => set({ confirm: e.target.value })}
          error={errors.confirm}
        />
        {twoFactor && (
          <>
            <Segmented
              id={`${formId}-source`}
              label="Code from"
              size="sm"
              options={[
                { value: "app", label: "Authenticator app" },
                { value: "backup", label: "Backup code" },
              ]}
              value={v.source}
              onChange={(source) => set({ source, code: "" })}
            />
            <Field
              key={v.source}
              id={`${formId}-code`}
              label={digits ? "6-digit code" : "Backup code"}
              inputMode={digits ? "numeric" : "text"}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={digits ? 6 : 11}
              placeholder={digits ? "000000" : "xxxxx-xxxxx"}
              value={v.code}
              onChange={(e) => set({ code: digits ? e.target.value.replace(/\D/g, "") : e.target.value })}
              error={errors.code}
              className="font-mono"
            />
          </>
        )}
      </form>
    </Dialog>
  );
}

/** Backup codes with copy and download. Shown once, right after they're made. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = React.useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`Karui backup codes\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "karui-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface px-5 py-4 font-mono text-[14px] tracking-[0.02em]">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={copy} className="flex-1">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="secondary" onClick={download} className="flex-1">
          <Download />
          Download
        </Button>
      </div>
    </div>
  );
}

export type TwoFactorSetupStep = "password" | "scan" | "codes";


export function TwoFactorSetupDialog({
  open,
  step,
  uri,
  secret,
  backupCodes,
  error,
  loading,
  onPassword,
  onVerify,
  onClose,
}: {
  open: boolean;
  step: TwoFactorSetupStep;
  uri?: string;
  secret?: string;
  backupCodes?: string[];
  error?: string | null;
  loading?: boolean;
  onPassword: (password: string) => void;
  onVerify: (code: string) => void;
  onClose: () => void;
}) {
  const formId = React.useId();
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setPassword("");
      setCode("");
      setSaved(false);
    }
  }, [open]);

  if (step === "codes") {
    return (
      <Dialog
        open={open}
        onClose={() => saved && onClose()}
        title="Save your backup codes"
        description="Each code signs you in once if you lose your phone. This is the only time you'll see them."
        footer={
          <Button onClick={onClose} disabled={!saved}>
            Done
          </Button>
        }
      >
        <BackupCodes codes={backupCodes ?? []} />
        <Checkbox id="backup-saved" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-5">
          <span className="text-fg">I&apos;ve saved my backup codes</span>
        </Checkbox>
      </Dialog>
    );
  }

  const scan = step === "scan";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={scan ? "Scan this code" : "Set up two-factor"}
      description={
        scan
          ? "Open your authenticator app, add an account and scan the code. Then enter the 6 digits it shows."
          : "Confirm your password to continue."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={loading} disabled={scan ? code.length !== 6 : !password}>
            {scan ? "Turn on" : "Continue"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (scan) onVerify(code);
          else onPassword(password);
        }}
      >
        {scan ? (
          <>
            {uri && <QrCode value={uri} label="QR code for your authenticator app" className="mx-auto size-44 p-1" />}
            {secret && (
              <p className="text-center text-[12.5px] leading-relaxed text-muted">
                Can&apos;t scan it? Enter this key instead:
                <span className="mt-1 block select-all break-all font-mono text-[13px] tracking-[0.04em] text-fg">
                  {secret.match(/.{1,4}/g)?.join(" ")}
                </span>
              </p>
            )}
            <Field
              id="setup-code"
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              error={error}
              className="font-mono"
              data-autofocus
            />
          </>
        ) : (
          <Field
            id="setup-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            data-autofocus
          />
        )}
      </form>
    </Dialog>
  );
}

export type TwoFactorCodeSource = "app" | "backup" | "email";

/** Email recovery may turn two-factor off but cannot generate replacement backup codes. */
export function TwoFactorConfirmDialog({
  open,
  kind,
  error,
  loading,
  emailHint,
  emailSending,
  emailSent,
  onSendEmailCode,
  onConfirm,
  onClose,
}: {
  open: boolean;
  kind: "off" | "codes";
  error?: string | null;
  loading?: boolean;
  /** Masked address the email code goes to, e.g. a•••@example.com. */
  emailHint?: string;
  emailSending?: boolean;
  emailSent?: boolean;
  onSendEmailCode?: () => void;
  onConfirm: (code: string, source: TwoFactorCodeSource) => void;
  onClose: () => void;
}) {
  const formId = React.useId();
  const [source, setSource] = React.useState<TwoFactorCodeSource>("app");
  const [code, setCode] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setSource("app");
      setCode("");
    }
  }, [open]);

  const off = kind === "off";
  const digits = source !== "backup";
  const waitingForEmail = source === "email" && !emailSent;
  const options: { value: TwoFactorCodeSource; label: string }[] = [
    { value: "app", label: "Authenticator app" },
    { value: "backup", label: "Backup code" },
    ...(off && onSendEmailCode ? [{ value: "email" as const, label: "Email" }] : []),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={off ? "Turn off two-factor?" : "Make new backup codes?"}
      description={off ? "Signing in will only ask for your password." : "Your current backup codes stop working."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={off ? "danger" : "primary"}
            loading={loading}
            disabled={digits ? code.length !== 6 : !code.trim()}
          >
            {off ? "Turn off" : "Make new codes"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(code, source);
        }}
      >
        <Segmented
          id={`${formId}-source`}
          label="Code from"
          size="sm"
          options={options}
          value={source}
          onChange={(v) => {
            setSource(v);
            setCode("");
          }}
        />
        {waitingForEmail ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3.5">
              <p className="text-pretty text-[13.5px] leading-relaxed text-muted">
                We&apos;ll send a 6-digit code to <span className="text-fg">{emailHint ?? "your email"}</span>.
              </p>
              <Button variant="secondary" onClick={onSendEmailCode} loading={emailSending} className="shrink-0">
                Send code
              </Button>
            </div>
            {error && (
              <p role="alert" className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
                <AlertCircle className="mt-px size-3.5" />
                {error}
              </p>
            )}
          </div>
        ) : (
          <Field
            key={source}
            id={`${formId}-code`}
            label={source === "app" ? "6-digit code" : source === "backup" ? "Backup code" : "Code from email"}
            labelAside={
              source === "email" ? (
                <button
                  type="button"
                  onClick={onSendEmailCode}
                  disabled={emailSending}
                  className="cursor-pointer font-sans text-[0.8125rem] text-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-45"
                >
                  Send a new code
                </button>
              ) : undefined
            }
            inputMode={digits ? "numeric" : "text"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={digits ? 6 : 11}
            placeholder={digits ? "000000" : "xxxxx-xxxxx"}
            value={code}
            onChange={(e) => setCode(digits ? e.target.value.replace(/\D/g, "") : e.target.value)}
            error={error}
            className="font-mono"
            autoFocus
          />
        )}
      </form>
    </Dialog>
  );
}


export function BackupCodesDialog({ open, codes, onClose }: { open: boolean; codes: string[]; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your new backup codes"
      description="Your old codes no longer work. This is the only time you'll see these."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <BackupCodes codes={codes} />
    </Dialog>
  );
}
