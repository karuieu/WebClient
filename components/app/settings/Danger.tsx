"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Field } from "@/components/kit/Field";
import { Check } from "@/components/kit/icons";
import { cx } from "@/lib/cx";

const WORD = "DELETE";

export type DangerSettingsProps = {
  deletingData?: boolean;
  dataError?: string | null;
  onDeleteData: (password: string) => void;
  requestingAccount?: boolean;
  accountError?: string | null;
  accountRequested?: boolean;
  onRequestAccountDeletion: (password: string) => void;
};

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-danger/35 p-5", className)}>
      <h3 className="text-[15px] font-medium tracking-[-0.01em]">{title}</h3>
      {children}
    </section>
  );
}

export function DangerSettings(p: DangerSettingsProps) {
  const [password, setPassword] = React.useState("");
  const [word, setWord] = React.useState("");
  const [accountPassword, setAccountPassword] = React.useState("");
  const canDelete = password.length > 0 && word === WORD;

  return (
    <>
      <Card title="Delete all data">
        <p className="mt-1.5 max-w-[34rem] text-pretty text-[13.5px] leading-relaxed text-muted">
          Removes every chat, project, memory file, your custom instructions and your name. Your account and plan stay, empty. This can&apos;t be undone.
        </p>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canDelete) p.onDeleteData(password);
          }}
        >
          <Field
            id="danger-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={p.dataError}
          />
          <Field
            id="danger-word"
            label={`Type ${WORD} to confirm`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            className="font-mono"
          />
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="danger" disabled={!canDelete} loading={p.deletingData}>
              Delete all data
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Delete account" className="mt-4">
        <p className="mt-1.5 max-w-[34rem] text-pretty text-[13.5px] leading-relaxed text-muted">
          Deletes your account and everything in it, and ends a Pro plan right away. We&apos;ll email you a link; nothing happens until you confirm on the page it opens.
        </p>
        {p.accountRequested ? (
          <p className="mt-5 flex items-center gap-2.5 rounded-xl bg-surface px-4 py-3 text-[13.5px]">
            <Check className="size-4" />
            Check your inbox and open the link to finish.
          </p>
        ) : (
          <form
            className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start"
            onSubmit={(e) => {
              e.preventDefault();
              if (accountPassword) p.onRequestAccountDeletion(accountPassword);
            }}
          >
            <Field
              id="danger-account-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              value={accountPassword}
              onChange={(e) => setAccountPassword(e.target.value)}
              error={p.accountError}
              className="flex-1"
            />
            <Button type="submit" variant="secondary" disabled={!accountPassword} loading={p.requestingAccount} className="sm:mt-7">
              Email me a link
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
