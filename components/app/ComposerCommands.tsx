"use client";

import * as React from "react";
import { Check } from "@/components/kit/icons";
import { Spinner } from "@/components/kit/Spinner";
import { menuStyles } from "@/components/kit/menuStyles";
import { cx } from "@/lib/ui/cx";

export type ComposerSkill = {
  id: string;
  name: string;
  description: string;
  source: "user" | "karui";
};

export type SkillCatalog =
  | { status: "ready"; items: ComposerSkill[] }
  | { status: "loading" }
  | { status: "error"; onRetry: () => void };

export type ComposerSkills = {
  catalog: SkillCatalog;
  selected: SelectedSkill | null;
  onSelect: (selection: SelectedSkill | null) => void;
  error?: string;
};

export type SelectedSkill = { skill: ComposerSkill; at: number };

export type ComposerCommand = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  selected?: boolean;
  onSelect: () => void;
};

export function ComposerCommands({
  id,
  catalog,
  items,
  query,
  active,
  onActive,
  onRetry,
}: {
  id: string;
  catalog?: SkillCatalog;
  items: ComposerCommand[];
  query: string;
  active: number;
  onActive: (index: number) => void;
  onRetry: () => void;
}): React.JSX.Element {
  React.useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, query]);

  return (
    <div className={cx(menuStyles.panel, "absolute bottom-full left-0 z-30 mb-1.5 w-60 max-w-full overflow-hidden")}>
      <div className="max-h-[min(22rem,40dvh)] overflow-y-auto overscroll-contain p-1.5">
        <div id={id} role="listbox" aria-label="Commands" aria-busy={catalog?.status === "loading"}>
          {items.map((command, index) => (
            <button
              key={command.id}
              id={`${id}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={active === index}
              title={`${command.name}\n${command.description}`}
              onPointerMove={() => onActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={command.onSelect}
              className={cx(
                menuStyles.row,
                "cursor-pointer items-center text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg",
                active === index && menuStyles.selected,
              )}
            >
              <span aria-hidden="true" className="shrink-0 text-muted">{command.icon}</span>
              <span className="min-w-0 flex-1 truncate">{command.name}</span>
              {command.selected !== undefined && <Check className={cx("transition-opacity duration-150", command.selected ? "opacity-100" : "opacity-0")} />}
            </button>
          ))}
        </div>
        {catalog?.status === "loading" && (
          <p role="status" className="flex items-center gap-2 px-2 py-3 text-[13px] text-muted">
            <Spinner className="size-4" /> Loading skills…
          </p>
        )}
        {catalog?.status === "error" && (
          <div className="px-2 py-3">
            <p role="alert" className="text-[14px] text-fg">{"Couldn't load your skills."}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 min-h-11 cursor-pointer rounded-lg px-2 text-[14px] font-medium text-fg underline underline-offset-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-fg"
            >Try again</button>
          </div>
        )}
        {(!catalog || catalog.status === "ready") && items.length === 0 && (
          <p role="status" className="break-words px-2 py-3 text-[13px] leading-relaxed text-muted [overflow-wrap:anywhere]">
            {query.trim() ? `No commands match “${query.trim()}”.` : "No skills are available in this chat."}
          </p>
        )}
      </div>
    </div>
  );
}
