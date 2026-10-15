"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Switch } from "@/components/kit/Controls";
import { Plus, Trash } from "@/components/kit/icons";
import { cx } from "@/lib/cx";
import { Group, SectionIntro } from "./Layout";

export type SkillItem = { id: string; name: string; description: string; content: string; enabled: boolean };
export type SkillFields = Pick<SkillItem, "name" | "description" | "content">;
export type SkillLimits = { skills: number; name: number; description: number; content: number };

export type SkillsSettingsProps = {
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
    <div className="flex flex-col gap-4 px-4 py-4">
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
          aria-describedby={`${id}-description-hint`}
          onChange={(e) => set({ description: e.target.value })}
          className={cx(field, "h-10")}
        />
        <p id={`${id}-description-hint`} className="mt-1.5 px-1 text-[12.5px] leading-relaxed text-muted">
          Karui decides from this and the name alone, so say when, not how.
        </p>
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

function Expand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={spring}
      className={cx("overflow-hidden", className)}
    >
      {children}
    </motion.div>
  );
}

function SkillRow({ skill, open, onOpen, onToggle }: { skill: SkillItem; open: boolean; onOpen: () => void; onToggle: (on: boolean) => void }) {
  return (
    <div className="flex min-h-16 items-center gap-3 pr-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={onOpen}
        className="min-w-0 flex-1 cursor-pointer py-3 pl-4 text-left"
      >
        <span className={cx("block truncate text-[14.5px] font-medium tracking-[-0.01em] transition-colors duration-150", !skill.enabled && "text-muted")}>
          {skill.name}
        </span>
        <span className="block truncate text-[12.5px] text-muted">{skill.description}</span>
      </button>
      <Switch checked={skill.enabled} onChange={onToggle} label={`Use ${skill.name}`} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4" aria-label="Loading skills">
      {[45, 60, 35].map((w, i) => (
        <span key={i} className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function SkillsSettings({ skills, limits, onCreate, onUpdate, onToggle, onDelete, onCreateWithKarui }: SkillsSettingsProps) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const atLimit = (skills?.length ?? 0) >= limits.skills;
  const nameTakenBy = (exceptId: string | null) => (name: string) =>
    !!name.trim() && !!skills?.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-label px-1 text-fg/80">Your skills</h3>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCreateWithKarui}>
            Create with Karui
          </Button>
          <Button variant="secondary" onClick={() => setEditing("new")} disabled={skills === null || atLimit || editing === "new"}>
            <Plus className="size-3.5" />
            New skill
          </Button>
        </div>
      </div>

      <Group
        footer={atLimit && <p>You have {limits.skills} skills, the most you can keep. Delete one to add another.</p>}
      >
        {skills === null ? (
          <Skeleton />
        ) : (
          <>
            <AnimatePresence initial={false}>
              {editing === "new" && (
                <Expand key="new">
                  <SkillEditor
                    skill={NEW_SKILL}
                    limits={limits}
                    isNameTaken={nameTakenBy(null)}
                    onSave={onCreate}
                    onClose={() => setEditing(null)}
                  />
                </Expand>
              )}
            </AnimatePresence>
            {skills.length === 0 && editing !== "new" && (
              <p className="px-4 py-5 text-[13.5px] leading-relaxed text-muted">
                No skills yet. Write one for a task you do often, or ask Karui to write it with you.
              </p>
            )}
            {skills.map((s) => (
              <div key={s.id}>
                <SkillRow
                  skill={s}
                  open={editing === s.id}
                  onOpen={() => setEditing((e) => (e === s.id ? null : s.id))}
                  onToggle={(on) => onToggle(s.id, on)}
                />
                <AnimatePresence initial={false}>
                  {editing === s.id && (
                    <Expand className="border-t border-line">
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
                    </Expand>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </>
        )}
      </Group>

      <SectionIntro>
        Skills teach Karui how you like a kind of task done, like a weekly update in your format. Karui reads a skill&apos;s instructions only when your message calls for it. Chats in a project use only the skills picked in its settings.
      </SectionIntro>
    </>
  );
}
