"use client";

import * as React from "react";
import { Button } from "@/components/kit/Button";
import { Switch } from "@/components/kit/Controls";
import { AlertCircle, BookOpen, Layers, Plug, Sliders } from "@/components/kit/icons";
import { Segmented } from "@/components/kit/Segmented";
import { cx } from "@/lib/cx";
import { Tile } from "../settings/ConnectorParts";
import { ConnectorsLocked } from "../settings/Connectors";
import { Group, Row, SectionIntro } from "../settings/Layout";
import { SettingsFrame, type FrameTab } from "../settings/SettingsFrame";
import { UsageMeter, formatBytes, type LibraryUsage } from "./Library";

export type ProjectSettingsTab = "general" | "memory" | "connectors" | "skills" | "danger";
export type YouMode = "live" | "copy" | "off";

const TABS: FrameTab<ProjectSettingsTab>[] = [
  { id: "general", label: "General", icon: <Sliders className="size-4" /> },
  { id: "memory", label: "Memory", icon: <Layers className="size-4" /> },
  { id: "connectors", label: "Connectors", icon: <Plug className="size-4" /> },
  { id: "skills", label: "Skills", icon: <BookOpen className="size-4" /> },
  { id: "danger", label: "Danger zone", icon: <AlertCircle className="size-4" />, danger: true },
];

export type ProjectSettingsProps = {
  open: boolean;
  tab: ProjectSettingsTab;
  onTab: (t: ProjectSettingsTab) => void;
  onClose: () => void;
  project: { name: string; goal: string };
  nameMax: number;
  goalMax: number;
  saving?: boolean;
  onSave: (name: string, goal: string) => void;
  storage: { project: LibraryUsage; account: { used: number; limit: number } } | null;
  memory: {
    on: boolean;
    onToggle: (on: boolean) => void;
    you: YouMode;
    onYou: (mode: YouMode) => void;
    copiedAt?: string | null;
    copying?: boolean;
    onCopyAgain: () => void;
    youAvailable: boolean;
    mainMemoryOff?: boolean;
  };
  connectors: {
    locked: boolean;
    items: { id: string; name: string; host: string }[];
    enabled: string[];
    onToggle: (id: string, on: boolean) => void;
    onOpenConnectors: () => void;
    onUpgrade: () => void;
  };
  skills: {
    items: { id: string; name: string; description: string }[];
    enabled: string[];
    onToggle: (id: string, on: boolean) => void;
    onOpenSkills: () => void;
  };
  onDelete: () => void;
};

const input =
  "w-full rounded-xl border border-line-strong bg-bg px-3 text-[14.5px] tracking-[-0.01em] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus:border-fg focus:shadow-[0_0_0_3px_var(--line)]";

const YOU_NOTE: Record<YouMode, string> = {
  live: "Chats here read it as it is today and keep up as it changes. They never write to it.",
  copy: "A copy sits in this project's Memory. Edits on either side stay on that side.",
  off: "Chats here know only what's in this project.",
};

function General(p: ProjectSettingsProps) {
  const [name, setName] = React.useState(p.project.name);
  const [goal, setGoal] = React.useState(p.project.goal);
  React.useEffect(() => setName(p.project.name), [p.project.name]);
  React.useEffect(() => setGoal(p.project.goal), [p.project.goal]);
  const dirty = name.trim() !== p.project.name || goal.trim() !== p.project.goal;

  return (
    <>
      <Group>
        <Row label="Name" htmlFor="project-settings-name">
          <input
            id="project-settings-name"
            data-focus="within"
            value={name}
            maxLength={p.nameMax}
            onChange={(e) => setName(e.target.value)}
            className={cx(input, "h-10")}
          />
        </Row>
        <Row label="Goal" description="What this project is for. Every chat here starts from it." htmlFor="project-settings-goal">
          <textarea
            id="project-settings-goal"
            data-focus="within"
            rows={3}
            value={goal}
            maxLength={p.goalMax}
            placeholder="Finish the thesis draft by November"
            onChange={(e) => setGoal(e.target.value)}
            className={cx(input, "resize-y py-2.5 leading-relaxed")}
          />
          {dirty && (
            <div className="mt-3 flex justify-end">
              <Button loading={p.saving} disabled={!name.trim()} onClick={() => p.onSave(name.trim(), goal.trim())}>
                Save
              </Button>
            </div>
          )}
        </Row>
      </Group>

      <Group title="Storage">
        {p.storage === null ? (
          <div className="flex flex-col gap-3 px-4 py-4" aria-label="Loading storage">
            {[45, 30].map((w, i) => (
              <span key={i} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <>
            <Row label="Library" description="The files you added to this project.">
              <UsageMeter usage={p.storage.project} />
            </Row>
            <Row
              label="Your account"
              description="Shared by every chat, memory file and project."
              control={
                <span className="font-mono text-[11.5px] tabular-nums text-muted">
                  {formatBytes(p.storage.account.used)} of {formatBytes(p.storage.account.limit)}
                </span>
              }
            />
          </>
        )}
      </Group>
    </>
  );
}

function Memory({ memory: m }: ProjectSettingsProps) {
  const liveBlocked = !m.youAvailable || !!m.mainMemoryOff;
  const note = !m.youAvailable
    ? "There's no “You” folder in your memory, so there's nothing to bring in."
    : m.mainMemoryOff && m.you !== "copy"
      ? "Memory is off in your settings, so there's nothing to read live. A copy still works."
      : YOU_NOTE[m.you];
  const copied = m.copiedAt
    ? new Date(m.copiedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <>
      <Group>
        <Row
          label="Project memory"
          description="Chats here read the Memory folder and add to it."
          control={<Switch checked={m.on} onChange={m.onToggle} label="Project memory" />}
        />
      </Group>

      <Group title="Your memory" footer="Only the “You” folder comes in. The rest of your memory stays out of this project, and nothing from here goes back.">
        <Row label="The “You” folder" description={note}>
          <Segmented
            id="project-you-mode"
            label="Use the You folder"
            className="sm:max-w-[20rem]"
            options={[
              { value: "live", label: "Live", disabled: liveBlocked },
              { value: "copy", label: "Copy", disabled: !m.youAvailable },
              { value: "off", label: "Off" },
            ]}
            value={m.you}
            onChange={m.onYou}
          />
        </Row>
        {m.you === "copy" && copied && (
          <Row
            label={`Copied ${copied}`}
            description="Copy again to replace it with what “You” holds now."
            control={
              <Button variant="secondary" onClick={m.onCopyAgain} loading={m.copying}>
                Copy again
              </Button>
            }
          />
        )}
      </Group>

      <SectionIntro>
        This project keeps its own memory, apart from the rest of Karui. Chats here read it and add what&apos;s worth keeping. You&apos;ll find it in the Library, in the Memory folder.
      </SectionIntro>
    </>
  );
}

function Connectors({ connectors: c }: ProjectSettingsProps) {
  if (c.locked) return <ConnectorsLocked onUpgrade={c.onUpgrade} />;
  if (!c.items.length)
    return (
      <div className="flex flex-col items-center px-2 py-14 text-center">
        <h3 className="text-heading">No connectors yet</h3>
        <p className="mt-2 max-w-[24rem] text-pretty text-[14px] leading-relaxed text-muted">
          Add one in Settings first. Then pick here which of them this project can use.
        </p>
        <Button variant="secondary" className="mt-6" onClick={c.onOpenConnectors}>
          Open Connectors
        </Button>
      </div>
    );
  return (
    <>
      <Group footer="Your connectors live on this device. On another one, this project only sees the connectors added there.">
        {c.items.map((it) => {
          const on = c.enabled.includes(it.id);
          return (
            <div key={it.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <Tile name={it.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em]">{it.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted">{it.host}</span>
              </span>
              <Switch checked={on} onChange={(v) => c.onToggle(it.id, v)} label={`Use ${it.name} in this project`} />
            </div>
          );
        })}
      </Group>


      <SectionIntro>Pick the connectors chats in this project can use. They start switched off, so a project only reaches what you allow.</SectionIntro>
    </>
  );
}

function Skills({ skills: s }: ProjectSettingsProps) {
  if (!s.items.length)
    return (
      <div className="flex flex-col items-center px-2 py-14 text-center">
        <h3 className="text-heading">No skills yet</h3>
        <p className="mt-2 max-w-[24rem] text-pretty text-[14px] leading-relaxed text-muted">
          Add one in Settings first. Then pick here which of them this project can use.
        </p>
        <Button variant="secondary" className="mt-6" onClick={s.onOpenSkills}>
          Open Skills
        </Button>
      </div>
    );
  return (
    <>
      <Group footer="A skill switched off in Settings stays off here too.">
        {s.items.map((it) => (
          <div key={it.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em]">{it.name}</span>
              <span className="block truncate text-[12.5px] text-muted">{it.description}</span>
            </span>
            <Switch checked={s.enabled.includes(it.id)} onChange={(v) => s.onToggle(it.id, v)} label={`Use ${it.name} in this project`} />
          </div>
        ))}
      </Group>


      <SectionIntro>Pick the skills chats in this project can use. They start switched off, so a project only follows what you choose.</SectionIntro>
    </>
  );
}

function Danger(p: ProjectSettingsProps) {
  return (
    <section className="rounded-2xl border border-danger/35 p-5">
      <h3 className="text-[15px] font-medium tracking-[-0.01em]">Delete project</h3>
      <p className="mt-1.5 max-w-[34rem] text-pretty text-[13.5px] leading-relaxed text-muted">
        Removes {p.project.name} with its Library and memory. Its chats stay in your library as ordinary chats. This can&apos;t be undone.
      </p>
      <div className="mt-5 flex justify-end">
        <Button variant="danger" onClick={p.onDelete}>
          Delete project
        </Button>
      </div>
    </section>
  );
}

export function ProjectSettings(p: ProjectSettingsProps) {
  return (
    <SettingsFrame
      open={p.open}
      title={p.project.name}
      label="Project settings"
      tabs={TABS}
      tab={p.tab}
      onTab={p.onTab}
      onClose={p.onClose}
      badges={p.connectors.locked ? { connectors: "Pro" } : undefined}
      sections={{
        general: <General {...p} />,
        memory: <Memory {...p} />,
        connectors: <Connectors {...p} />,
        skills: <Skills {...p} />,
        danger: <Danger {...p} />,
      }}
    />
  );
}
