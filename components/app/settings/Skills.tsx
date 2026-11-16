"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Switch } from "@/components/kit/Controls";
import { ChevronDown, ChevronLeft, ChevronRight, MessageSquare, Pencil, Plus, Trash } from "@/components/kit/icons";
import { Menu } from "@/components/kit/Menu";
import { Segmented } from "@/components/kit/Segmented";
import { cx } from "@/lib/ui/cx";
import { PAGE_ACTION, PageActions } from "../PageActions";
import { Group, LIST_FRAME } from "./Layout";

export type SkillItem = { id: string; name: string; description: string; content: string; enabled: boolean };
export type SkillFields = Pick<SkillItem, "name" | "description" | "content">;
export type SkillLimits = { skills: number; name: number; description: number; content: number };
/** Karui's own skills: "always" ones are part of how Karui answers and can't be removed. */
export type KaruiSkillItem = {
  id: string;
  name: string;
  description: string;
  content: string;
  install: "always" | "default" | "optional";
  installed: boolean;
};

export type SkillsSettingsProps = {
  /** null while loading. */
  skills: SkillItem[] | null;
  /** null while loading. */
  karuiSkills: KaruiSkillItem[] | null;
  limits: SkillLimits;
  onCreate: (fields: SkillFields) => void;
  onUpdate: (id: string, fields: SkillFields) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onInstall: (id: string, installed: boolean) => void;
  onCreateWithKarui: () => void;
};

const NEW_SKILL: SkillFields = { name: "", description: "", content: "" };
const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;
const field =
  "w-full rounded-xl border border-line-strong bg-bg px-3 text-[14px] outline-none transition-[border-color] duration-150 placeholder:text-subtle focus:border-fg/40";

function Label({ htmlFor, children, aside }: { htmlFor: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-muted">
        {children}
      </label>
      {aside}
    </div>
  );
}

function SkillEditor({
  skill,
  limits,
  isNameTaken,
  onSave,
  onDelete,
  onClose,
}: {
  skill: SkillFields;
  limits: SkillLimits;
  isNameTaken: (name: string) => boolean;
  onSave: (fields: SkillFields) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const id = React.useId();
  const [draft, setDraft] = React.useState(skill);
  const dirty = draft.name !== skill.name || draft.description !== skill.description || draft.content !== skill.content;
  const nameTaken = isNameTaken(draft.name);
  const complete = !!(draft.name.trim() && draft.description.trim() && draft.content.trim());
  const set = (patch: Partial<SkillFields>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="flex flex-col gap-4 bg-surface p-4">
      <div>
        <Label htmlFor={`${id}-name`}>Name</Label>
        <input
          id={`${id}-name`}
          data-focus="within"
          autoFocus={!skill.name}
          value={draft.name}
          maxLength={limits.name}
          placeholder="Weekly update"
          aria-invalid={nameTaken || undefined}
          aria-describedby={nameTaken ? `${id}-taken` : undefined}
          onChange={(e) => set({ name: e.target.value })}
          className={cx(field, "h-10 font-medium", nameTaken && "border-danger focus:border-danger")}
        />
        {nameTaken && (
          <p id={`${id}-taken`} role="alert" className="mt-1.5 px-1 text-[12.5px] text-danger">
            You already have a skill with this name.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor={`${id}-description`}>When Karui should use it</Label>
        <input
          id={`${id}-description`}
          data-focus="within"
          value={draft.description}
          maxLength={limits.description}
          placeholder="When I ask for my weekly update to the team"
          onChange={(e) => set({ description: e.target.value })}
          className={cx(field, "h-10")}
        />
      </div>
      <div>
        <Label
          htmlFor={`${id}-content`}
          aside={
            <span className="font-mono text-[11px] text-muted tabular-nums">
              {draft.content.length.toLocaleString("en")} / {limits.content.toLocaleString("en")}
            </span>
          }
        >
          Instructions
        </Label>
        <textarea
          id={`${id}-content`}
          data-focus="within"
          rows={10}
          value={draft.content}
          maxLength={limits.content}
          placeholder="Brief it like a colleague: the steps, the format, what to leave out."
          onChange={(e) => set({ content: e.target.value })}
          className={cx(field, "resize-y py-2.5 font-mono text-[12.5px] leading-relaxed placeholder:font-sans")}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
          >
            <Trash className="size-3.5" />
            Delete skill
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {dirty ? "Cancel" : "Close"}
          </Button>
          <Button
            disabled={!dirty || !complete || nameTaken}
            onClick={() => {
              onSave({ name: draft.name.trim(), description: draft.description.trim(), content: draft.content.trim() });
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

const ROW = "flex min-h-[4.25rem] items-center gap-3 pr-4 transition-colors duration-150 hover:bg-surface";
const OPEN_ROW = "min-w-0 flex-1 cursor-pointer py-3 pl-4 text-left";

function RowText({ name, meta, dim }: { name: string; meta: string; dim?: boolean }) {
  return (
    <>
      <span className={cx("block truncate text-[15px] tracking-[-0.01em] transition-colors duration-150", dim && "text-muted")}>{name}</span>
      <span className="mt-1 block truncate text-[13px] text-muted">{meta}</span>
    </>
  );
}

function SkillRow({ skill, onOpen, onToggle }: { skill: SkillItem; onOpen: () => void; onToggle: (on: boolean) => void }) {
  return (
    <div className={ROW}>
      <button type="button" onClick={onOpen} className={OPEN_ROW}>
        <RowText name={skill.name} meta={skill.description} dim={!skill.enabled} />
      </button>
      <Switch checked={skill.enabled} onChange={onToggle} label={`Use ${skill.name}`} />
    </div>
  );
}

function karuiStatus(skill: KaruiSkillItem): string {
  if (skill.install === "always") return "Built in";
  return skill.installed ? "Added" : "";
}

function KaruiSkillRow({ skill, onOpen, showStatus }: { skill: KaruiSkillItem; onOpen: () => void; showStatus?: boolean }) {
  const status = showStatus ? karuiStatus(skill) : "";
  return (
    <div className={ROW}>
      <button type="button" onClick={onOpen} className={cx(OPEN_ROW, "flex items-center gap-3")}>
        <span className="min-w-0 flex-1">
          <RowText name={skill.name} meta={`from Karui · ${skill.description}`} />
        </span>
        {status && <span className="shrink-0 font-mono text-[11.5px] text-muted">{status}</span>}
        <ChevronRight className="size-3.5 shrink-0 text-muted" />
      </button>
    </div>
  );
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full pl-1.5 pr-3 text-[13px] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
    >
      <ChevronLeft className="size-3.5" />
      {label}
    </button>
  );
}

function DetailHeader({ name, meta, actions }: { name: string; meta: string; actions?: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-heading truncate">{name}</h3>
        <p className="mt-1 truncate font-mono text-[11px] text-muted">{meta}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

function SkillBody({ description, content, footer }: { description: string; content: string; footer?: string }) {
  return (
    <>
      <Group title="When Karui uses it" className="mt-9">
        <p className="px-4 py-3.5 text-pretty text-[14.5px] leading-relaxed">{description}</p>
      </Group>
      <Group title="Instructions" footer={footer}>
        <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3.5 font-mono text-[12.5px] leading-relaxed">{content}</pre>
      </Group>
    </>
  );
}

function KaruiSkillDetail({ skill, onInstall }: { skill: KaruiSkillItem; onInstall: (installed: boolean) => void }) {
  const always = skill.install === "always";
  return (
    <>
      <DetailHeader
        name={skill.name}
        meta={!always && skill.installed ? "from Karui · Added" : "from Karui"}
        actions={
          !skill.installed ? (
            <Button onClick={() => onInstall(true)}>Add</Button>
          ) : (
            !always && (
              <Button variant="secondary" onClick={() => onInstall(false)}>
                Remove
              </Button>
            )
          )
        }
      />
      <SkillBody
        description={skill.description}
        content={skill.content}
        footer={always ? "Part of how Karui answers, so it can't be removed." : undefined}
      />
    </>
  );
}

function UserSkillDetail({
  skill,
  limits,
  isNameTaken,
  onUpdate,
  onToggle,
  onDelete,
}: {
  skill: SkillItem;
  limits: SkillLimits;
  isNameTaken: (name: string) => boolean;
  onUpdate: (fields: SkillFields) => void;
  onToggle: (on: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  if (editing) {
    return (
      <div className="mt-5 overflow-hidden rounded-2xl border border-line-strong">
        <SkillEditor skill={skill} limits={limits} isNameTaken={isNameTaken} onSave={onUpdate} onDelete={onDelete} onClose={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <>
      <DetailHeader
        name={skill.name}
        meta={skill.enabled ? "Yours · on" : "Yours · off"}
        actions={
          <>
            <Switch checked={skill.enabled} onChange={onToggle} label={`Use ${skill.name}`} />
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          </>
        }
      />
      <SkillBody description={skill.description} content={skill.content} />
    </>
  );
}

function Skeleton() {
  return (
    <ul aria-label="Loading skills" className="flex flex-col gap-1">
      {[45, 60, 35].map((w, i) => (
        <li key={i} className="flex min-h-[4.25rem] flex-col justify-center gap-2 px-4">
          <span className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
          <span className="h-2.5 w-1/4 animate-pulse rounded-full bg-surface-2" />
        </li>
      ))}
    </ul>
  );
}

type Entry = { kind: "user"; skill: SkillItem } | { kind: "karui"; skill: KaruiSkillItem };
type View = "yours" | "discover";

export function SkillsSettings({ skills, karuiSkills, limits, onCreate, onUpdate, onToggle, onDelete, onInstall, onCreateWithKarui }: SkillsSettingsProps) {
  const reduce = useReducedMotion();
  const [view, setView] = React.useState<View>("yours");
  /** The skill whose page is open, or "new" for the editor of a new skill. */
  const [openId, setOpenId] = React.useState<string | null>(null);
  const atLimit = (skills?.length ?? 0) >= limits.skills;
  // From 80% of the limit the count shows above the list, where it's seen without scrolling.
  const nearLimit = (skills?.length ?? 0) >= limits.skills * 0.8;
  const yours = skills && karuiSkills ? entries(skills, karuiSkills) : [];
  const nameTakenBy = (exceptId: string | null) => (name: string) =>
    !!name.trim() && !!skills?.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const openUser = skills?.find((s) => s.id === openId);
  const openKarui = karuiSkills?.find((s) => s.id === openId);
  const close = () => setOpenId(null);

  const page = (): React.ReactNode => {
    if (openId === "new") {
      return (
        <div className="mt-5 overflow-hidden rounded-2xl border border-line-strong">
          <SkillEditor skill={NEW_SKILL} limits={limits} isNameTaken={nameTakenBy(null)} onSave={onCreate} onClose={close} />
        </div>
      );
    }
    if (openUser) {
      return (
        <UserSkillDetail
          skill={openUser}
          limits={limits}
          isNameTaken={nameTakenBy(openUser.id)}
          onUpdate={(fields) => onUpdate(openUser.id, fields)}
          onToggle={(on) => onToggle(openUser.id, on)}
          onDelete={() => {
            onDelete(openUser.id);
            close();
          }}
        />
      );
    }
    if (openKarui) return <KaruiSkillDetail skill={openKarui} onInstall={(on) => onInstall(openKarui.id, on)} />;
    return null;
  };

  const list = (): React.ReactNode => {
    if (view === "discover") {
      if (karuiSkills === null) return <Skeleton />;
      return (
        <ul className={LIST_FRAME}>
          {karuiSkills.map((s) => (
            <li key={s.id}>
              <KaruiSkillRow skill={s} showStatus onOpen={() => setOpenId(s.id)} />
            </li>
          ))}
        </ul>
      );
    }
    if (skills === null || karuiSkills === null) return <Skeleton />;
    return (
      <>
        {nearLimit && (
          <p className="mb-3 px-4 font-mono text-[11.5px] tabular-nums text-muted">
            {skills.length} / {limits.skills} skills.{atLimit && " Delete one to add another."}
          </p>
        )}
        {yours.length === 0 ? (
          <p className="px-4 py-6 text-[15px] text-muted">No skills yet.</p>
        ) : (
          <ul className={LIST_FRAME}>
            {yours.map((e) => (
              <li key={e.skill.id}>
                {e.kind === "karui" ? (
                  <KaruiSkillRow skill={e.skill} onOpen={() => setOpenId(e.skill.id)} />
                ) : (
                  <SkillRow skill={e.skill} onOpen={() => setOpenId(e.skill.id)} onToggle={(on) => onToggle(e.skill.id, on)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  };

  const detail = page();

  return (
    <>
      <PageActions>
        <Segmented
          id="skills-view"
          label="Skills"
          options={[
            { value: "yours", label: "Yours" },
            { value: "discover", label: "Discover" },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            close();
          }}
        />
        <Menu
          label="New skill"
          sheetTitle="New skill"
          items={[
            { label: "Create with Karui", icon: <MessageSquare className="size-3.5" />, onSelect: onCreateWithKarui },
            {
              label: "Write it yourself",
              icon: <Pencil className="size-3.5" />,
              onSelect: () => {
                setView("yours");
                setOpenId("new");
              },
            },
          ]}
        >
          {({ open, triggerProps }) => (
            <Button {...triggerProps} disabled={skills === null || atLimit || openId === "new"} className={PAGE_ACTION}>
              <Plus className="size-3.5" />
              New
              <ChevronDown className={cx("size-3.5 transition-transform duration-200 ease-out-soft", open && "rotate-180")} />
            </Button>
          )}
        </Menu>
      </PageActions>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={detail ? `skill-${openId}` : view}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={spring}
        >
          {detail ? (
            <>
              <BackButton label={openId === "new" ? "Yours" : view === "yours" ? "Yours" : "Discover"} onBack={close} />
              {detail}
            </>
          ) : (
            list()
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/** The user's skills and the Karui skills they have, in one list by name. */
function entries(skills: SkillItem[], karuiSkills: KaruiSkillItem[]): Entry[] {
  const all: Entry[] = [
    ...skills.map((skill) => ({ kind: "user" as const, skill })),
    ...karuiSkills.filter((s) => s.installed).map((skill) => ({ kind: "karui" as const, skill })),
  ];
  return all.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
}
