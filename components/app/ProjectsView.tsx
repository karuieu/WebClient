"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/kit/Button";
import { Label } from "@/components/kit/Frame";
import { Ellipsis, Folder, Plus, Sliders, Star, Trash } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import { cx } from "@/lib/cx";
import { useNow } from "@/components/kit/useMounted";
import { Enter, cascade } from "@/components/kit/Enter";
import { SearchField, standaloneStamp } from "./ChatsView";

export type ProjectCardData = { id: string; name: string; goal?: string; starred: boolean; updatedAt: string };

export type ProjectsViewProps = {
  projects: ProjectCardData[];
  loading?: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onNew: () => void;
  actions: {
    onStar: (p: ProjectCardData) => void;
    onEdit: (p: ProjectCardData) => void;
    onDelete: (p: ProjectCardData) => void;
  };
};

function Card({
  project,
  now,
  actions,
  enterDelay,
}: {
  project: ProjectCardData;
  now: Date | null;
  actions: ProjectsViewProps["actions"];
  enterDelay: number;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const items: MenuItem[] = [
    {
      label: project.starred ? "Unstar" : "Star",
      icon: <Star filled={project.starred} className="size-3.5" />,
      onSelect: () => actions.onStar(project),
    },
    { label: "Project settings", icon: <Sliders className="size-3.5" />, onSelect: () => actions.onEdit(project) },
    { type: "separator" },
    { label: "Delete", icon: <Trash className="size-3.5" />, danger: true, onSelect: () => actions.onDelete(project) },
  ];

  return (
    <li className="group/card relative bg-bg">
      <Link
        href={`/projects/${project.id}`}
        className={cx(
          "flex h-full min-h-44 flex-col p-6 transition-colors duration-200",
          menuOpen ? "bg-surface" : "hover:bg-surface",
        )}
      >
        <Enter delay={enterDelay} offset={10} blur={false}>
          <span className="flex flex-1 flex-col">
            <span className="grid size-9 place-items-center rounded-xl border border-line bg-elevated text-muted transition-colors duration-200 group-hover/card:text-fg">
              <Folder className="size-4" />
            </span>
            <span className="mt-5 flex items-center gap-2 pr-8">
              <span className="truncate text-[1.0625rem] font-medium tracking-[-0.015em]">{project.name}</span>
              {project.starred && <Star filled className="size-3 shrink-0 text-muted" />}
            </span>
            <span className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-muted">
              {project.goal || "No goal yet."}
            </span>
            <span className="mt-auto pt-5 font-mono text-[11px] text-muted">{now ? `Updated ${standaloneStamp(project.updatedAt, now)}` : "\u00a0"}</span>
          </span>
        </Enter>
      </Link>
      <Menu label={`Actions for ${project.name}`} items={items} onOpenChange={setMenuOpen} className="absolute right-4 top-5">
        {({ open, triggerProps }) => (
          <button
            {...triggerProps}
            aria-label={`Actions for ${project.name}`}
            className={cx(
              "grid size-8 cursor-pointer place-items-center rounded-full text-muted transition-[opacity,background-color,color] duration-150 hover:bg-surface-2 hover:text-fg",
              open
                ? "bg-surface-2 text-fg"
                : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/card:opacity-100 [@media(hover:hover)]:group-hover/card:opacity-100",
            )}
          >
            <Ellipsis />
          </button>
        )}
      </Menu>
    </li>
  );
}

export function ProjectsView({ projects, loading, query, onQueryChange, onNew, actions }: ProjectsViewProps) {
  const now = useNow();
  const searchRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const first = React.useRef(true);
  React.useEffect(() => {
    if (!loading && projects.length) first.current = false;
  }, [loading, projects.length]);

  return (
    <div className="mx-auto w-full max-w-[60rem] px-4 pb-24 pt-16 sm:px-6 md:pt-20">
      <Enter>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[34rem]">
            <Label>Library</Label>
            <h1 className="text-title mt-4">Projects</h1>
          </div>
          <Button onClick={onNew} className="mb-1.5">
            <Plus className="size-4" />
            New project
          </Button>
        </div>
      </Enter>

      {(projects.length > 0 || query) && (
        <Enter delay={60}>
          <div className="mt-10">
            <SearchField ref={searchRef} value={query} onChange={onQueryChange} placeholder="Search your projects" label="Search projects" shortcut="/" />
          </div>
        </Enter>
      )}

      <div className="mt-8">
        {loading ? (
          <ul aria-label="Loading projects" className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex min-h-44 flex-col bg-bg p-6">
                <span className="size-9 animate-pulse rounded-xl bg-surface-2" />
                <span className="mt-5 h-3.5 w-1/2 animate-pulse rounded-full bg-surface-2" />
                <span className="mt-3 h-2.5 w-4/5 animate-pulse rounded-full bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : projects.length === 0 ? (
          <Enter delay={100} blur={false}>
            <div className="rounded-3xl border border-line px-6 py-16 text-center">
              {query ? (
                <p className="text-[15px] font-medium tracking-[-0.01em]">Nothing matches “{query}”.</p>
              ) : (
                <>
                  <p className="text-[15px] font-medium tracking-[-0.01em]">No projects yet.</p>
                  <p className="mt-1.5 text-[14px] text-muted">
                    Your projects will live here, encrypted.
                  </p>
                </>
              )}
            </div>
          </Enter>
        ) : (
          <Enter delay={100} blur={false}>
            <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => (
                <Card key={p.id} project={p} now={now} actions={actions} enterDelay={first.current ? cascade(i, 180, 45, 8) : 0} />
              ))}
              {Array.from({ length: 2 }).map((_, i) => {
                const sm = projects.length % 2 ? 1 : 0;
                const lg = (3 - (projects.length % 3)) % 3;
                return (
                  <li
                    key={`fill-${i}`}
                    aria-hidden="true"
                    className={cx("hidden bg-bg", i < sm ? "sm:block" : "sm:hidden", i < lg ? "lg:block" : "lg:hidden")}
                  />
                );
              })}
            </ul>
          </Enter>
        )}
      </div>
    </div>
  );
}
