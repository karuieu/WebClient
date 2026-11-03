"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Switch } from "@/components/kit/Controls";
import { ChevronDown, MessageSquare, Pencil, Plus, Trash } from "@/components/kit/icons";
import { Menu } from "@/components/kit/Menu";
import { Segmented } from "@/components/kit/Segmented";
import { cx } from "@/lib/ui/cx";
import { PAGE_ACTION, PageActions } from "../PageActions";
import { LIST_FRAME } from "./Layout";

export type SkillItem = { id: string; name: string; description: string; content: string; enabled: boolean };
export type SkillFields = Pick<SkillItem, "name" | "description" | "content">;
export type SkillLimits = { skills: number; name: number; description: number; content: number };

export type SkillsSettingsProps = {
  /** null while loading. */
  skills: SkillItem[] | null;
  limits: SkillLimits;
  onCreate: (fields: SkillFields) => void;
  onUpdate: (id: string, fields: SkillFields) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
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

function SkillRow({ skill, onOpen, onToggle }: { skill: SkillItem; onOpen: () => void; onToggle: (on: boolean) => void }) {
  return (
    <div className={ROW}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer py-3 pl-4 text-left">
        <span className={cx("block truncate text-[15px] tracking-[-0.01em] transition-colors duration-150", !skill.enabled && "text-muted")}>
          {skill.name}
        </span>
        <span className="mt-1 block truncate text-[13px] text-muted">{skill.description}</span>
      </button>
      <Switch checked={skill.enabled} onChange={onToggle} label={`Use ${skill.name}`} />
    </div>
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

export function SkillsSettings({ skills, limits, onCreate, onUpdate, onToggle, onDelete, onCreateWithKarui }: SkillsSettingsProps) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"yours" | "discover">("yours");
  const atLimit = (skills?.length ?? 0) >= limits.skills;
  // From 80% of the limit the count shows above the list, where it's seen without scrolling.
  const nearLimit = (skills?.length ?? 0) >= limits.skills * 0.8;
  const nameTakenBy = (exceptId: string | null) => (name: string) =>
    !!name.trim() && !!skills?.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase());

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
          onChange={setView}
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
                setEditing("new");
              },
            },
          ]}
        >
          {({ open, triggerProps }) => (
            <Button {...triggerProps} disabled={skills === null || atLimit || editing === "new"} className={PAGE_ACTION}>
              <Plus className="size-3.5" />
              New
              <ChevronDown className={cx("size-3.5 transition-transform duration-200 ease-out-soft", open && "rotate-180")} />
            </Button>
          )}
        </Menu>
      </PageActions>

      {view === "discover" ? (
        // Planned, not built yet.
        <p className="px-4 py-6 text-[15px] text-muted">Coming soon.</p>
      ) : skills === null ? (
        <Skeleton />
      ) : (
        <>
          {nearLimit && (
            <p className="mb-3 px-4 font-mono text-[11.5px] tabular-nums text-muted">
              {skills.length} / {limits.skills} skills.{atLimit && " Delete one to add another."}
            </p>
          )}
          {skills.length === 0 && editing !== "new" && <p className="px-4 py-6 text-[15px] text-muted">No skills yet.</p>}
          <ul className={cx(LIST_FRAME, skills.length === 0 && editing !== "new" && "hidden")}>
            <AnimatePresence initial={false}>
              {editing === "new" && (
                <motion.li key="new" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
                  <SkillEditor skill={NEW_SKILL} limits={limits} isNameTaken={nameTakenBy(null)} onSave={onCreate} onClose={() => setEditing(null)} />
                </motion.li>
              )}
            </AnimatePresence>
            {skills.map((s) => (
              <li key={s.id}>
                {editing === s.id ? (
                  <SkillEditor
                    skill={s}
                    limits={limits}
                    isNameTaken={nameTakenBy(s.id)}
                    onSave={(fields) => onUpdate(s.id, fields)}
                    onDelete={() => {
                      onDelete(s.id);
                      setEditing(null);
                    }}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <SkillRow skill={s} onOpen={() => setEditing(s.id)} onToggle={(on) => onToggle(s.id, on)} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
