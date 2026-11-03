"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Switch } from "@/components/kit/Controls";
import { ArrowUpRight } from "@/components/kit/icons";
import { Segmented } from "@/components/kit/Segmented";
import { useTheme, type ThemePreference } from "@/lib/ui/theme";
import { cx } from "@/lib/ui/cx";
import { Group, Row } from "./Layout";

export type GeneralSettingsProps = {
  displayName: string;
  fullName: string;
  nameMax: number;
  savingProfile?: boolean;
  onSaveProfile: (displayName: string, fullName: string) => void;
  /** Opens the page outside settings where custom instructions are edited. */
  onOpenInstructions: () => void;
  titleMode: "ai" | "first-message";
  onTitleMode: (m: "ai" | "first-message") => void;
  artifacts: boolean;
  onArtifacts: (v: boolean) => void;
  tabNames: boolean;
  onTabNames: (v: boolean) => void;
  version: string;
  /** Missing when the build had no git checkout to read from. */
  commit?: { hash: string; url: string };
};

function inputClass() {
  return "h-10 w-full rounded-xl border border-line-strong bg-bg px-3 text-[14.5px] tracking-[-0.01em] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus:border-fg focus:shadow-[0_0_0_3px_var(--line)]";
}

export function GeneralSettings(p: GeneralSettingsProps) {
  const { preference, setPreference } = useTheme();
  const [name, setName] = React.useState(p.displayName);
  const [full, setFull] = React.useState(p.fullName);

  React.useEffect(() => setName(p.displayName), [p.displayName]);
  React.useEffect(() => setFull(p.fullName), [p.fullName]);

  const profileDirty = name.trim() !== p.displayName || full.trim() !== p.fullName;

  return (
    <>
      <Group title="Profile" footer="Karui uses your name to greet you.">
        <Row label="Name" htmlFor="settings-name">
          <input
            id="settings-name"
            data-focus="within"
            value={name}
            maxLength={p.nameMax}
            autoComplete="given-name"
            onChange={(e) => setName(e.target.value)}
            className={inputClass()}
          />
        </Row>
        <Row label="Full name" description="Optional." htmlFor="settings-full-name">
          <input
            id="settings-full-name"
            data-focus="within"
            value={full}
            maxLength={p.nameMax}
            autoComplete="name"
            onChange={(e) => setFull(e.target.value)}
            className={inputClass()}
          />
          <div className={cx("flex justify-end overflow-hidden transition-[max-height,opacity,margin] duration-300", profileDirty ? "mt-3 max-h-12 opacity-100" : "max-h-0 opacity-0")}>
            <Button
              loading={p.savingProfile}
              disabled={!name.trim() || !profileDirty}
              onClick={() => p.onSaveProfile(name.trim(), full.trim())}
              tabIndex={profileDirty ? 0 : -1}
            >
              Save
            </Button>
          </div>
        </Row>
      </Group>

      <Group title="Appearance">
        <Row
          label="Theme"
          control={
            <Segmented
              id="settings-theme"
              label="Theme"
              size="sm"
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              value={preference}
              onChange={(v) => setPreference(v as ThemePreference)}
            />
          }
        />
      </Group>

      <Group>
        <Row
          label="Custom instructions"
          description="Read and edit them in Workspace."
          control={
            <Button variant="secondary" onClick={p.onOpenInstructions}>
              Open
            </Button>
          }
        />
      </Group>

      <Group title="Chats">
        <Row
          label="Chat titles"
          control={
            <Segmented
              id="settings-titles"
              label="Chat titles"
              size="sm"
              options={[
                { value: "ai", label: "By AI" },
                { value: "first-message", label: "First message" },
              ]}
              value={p.titleMode}
              onChange={p.onTitleMode}
            />
          }
        />
        <Row
          label="Documents"
          description="Standalone documents you can open, print and download."
          control={<Switch checked={p.artifacts} onChange={p.onArtifacts} label="Documents in answers" />}
        />
        <Row
          label="Names in the tab"
          description="Show the name in the browser tab. Browsers keep tab titles in history, unencrypted, and may sync them."
          control={<Switch checked={p.tabNames} onChange={p.onTabNames} label="Names in the browser tab" />}
        />
      </Group>

      <p className="mt-9 flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted">
        <span>v{p.version}</span>
        {p.commit && (
          <>
            <span aria-hidden>·</span>
            <a
              href={p.commit.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Commit ${p.commit.hash} on GitHub`}
              className="inline-flex items-center gap-1 underline-offset-4 hover:text-fg hover:underline"
            >
              {p.commit.hash}
              <ArrowUpRight className="size-3" />
            </a>
          </>
        )}
      </p>
    </>
  );
}
