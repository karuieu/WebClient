"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/kit/Button";
import { Enter } from "@/components/kit/Enter";
import { ChevronDown, Plus } from "@/components/kit/icons";
import { Menu, type MenuItem } from "@/components/kit/Menu";
import type { ArtifactType } from "@/lib/artifacts/artifacts";
import { cx } from "@/lib/ui/cx";
import { SearchField } from "./ChatsView";
import { ARTIFACT_TYPES, ArtifactGallery, type ArtifactItem, type OpenArtifact } from "./artifacts/ArtifactGallery";

export type ArtifactFilter = "all" | ArtifactType;

export type ArtifactsViewProps = {
  /** Already filtered and searched; null while loading. */
  artifacts: ArtifactItem[] | null;
  total: number;
  error?: boolean;
  onRetry?: () => void;
  filter: ArtifactFilter;
  onFilter: (f: ArtifactFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  onOpen: OpenArtifact;
  /** Starts a new chat: artifacts are made by asking Karui. */
  onNew: () => void;
};

const labelOf = (f: ArtifactFilter): string => (f === "all" ? "All types" : (ARTIFACT_TYPES.find((t) => t.id === f)?.label ?? ""));

function TypeMenu({ value, onChange }: { value: ArtifactFilter; onChange: (v: ArtifactFilter) => void }) {
  const item = (v: ArtifactFilter): MenuItem => ({ label: labelOf(v), checked: v === value, onSelect: () => onChange(v) });
  return (
    <Menu label="Type" sheetTitle="Type" items={[item("all"), { type: "separator" }, ...ARTIFACT_TYPES.map((t) => item(t.id))]}>
      {({ open, triggerProps }) => (
        <button
          {...triggerProps}
          aria-label={`Type: ${labelOf(value)}`}
          className={cx(
            "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-elevated pl-4 pr-3.5 text-[14px] tracking-[-0.01em] transition-colors duration-150 hover:bg-surface",
            open && "bg-surface",
          )}
        >
          {labelOf(value)}
          <ChevronDown className={cx("size-3.5 text-muted transition-transform duration-200 ease-out-soft", open && "rotate-180")} />
        </button>
      )}
    </Menu>
  );
}

function Loading() {
  return (
    <ul aria-label="Loading artifacts" className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <span className="block aspect-[4/3] animate-pulse rounded-2xl bg-surface-2" />
          <span className="mt-3.5 block h-3 w-3/4 animate-pulse rounded-full bg-surface-2" />
          <span className="mt-2 block h-2 w-24 animate-pulse rounded-full bg-surface-2" />
        </li>
      ))}
    </ul>
  );
}

function Message({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line px-6 py-16 text-center">
      <p className="text-[15px] tracking-[-0.01em] text-muted">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ArtifactsView(p: ArtifactsViewProps) {
  const { artifacts, total, filter, query } = p;
  const reduce = useReducedMotion();

  // Tiles cascade in the first time they show; after that, type switches crossfade and search just filters.
  const revealed = React.useRef(false);
  const cascadeIn = !revealed.current;
  React.useEffect(() => {
    if (artifacts?.length) revealed.current = true;
  }, [artifacts]);

  const newButton = (
    <Button onClick={p.onNew}>
      <Plus className="size-3.5" />
      New artifact
    </Button>
  );

  let content: React.ReactNode;
  if (p.error) {
    content = (
      <Message action={p.onRetry && <Button variant="secondary" onClick={p.onRetry}>Try again</Button>}>Your artifacts couldn&apos;t be loaded.</Message>
    );
  } else if (artifacts === null) {
    content = <Loading />;
  } else if (total === 0) {
    content = <Message>Docs, sites and code Karui makes for you will show up here.</Message>;
  } else if (!artifacts.length) {
    content = <Message>{query ? `Nothing matches “${query}”.` : `No ${labelOf(filter).toLowerCase()} yet.`}</Message>;
  } else {
    content = <ArtifactGallery artifacts={artifacts} onOpen={p.onOpen} cascadeFrom={cascadeIn ? 0 : undefined} />;
  }

  return (
    <div className="mx-auto w-full max-w-[60rem] px-4 pb-24 pt-16 sm:px-6 md:pt-20">
      <Enter>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="text-title">Artifacts</h1>
          <div className="flex items-center gap-2 pb-1.5">
            {total > 0 && <span className="mr-2 font-mono text-[12px] text-muted tabular-nums">{total} artifacts</span>}
            {newButton}
          </div>
        </div>
      </Enter>

      {(total > 0 || query) && !p.error && (
        <Enter delay={60}>
          <div className="mt-10 flex gap-2">
            <SearchField value={query} onChange={p.onQuery} placeholder="Search artifacts" label="Search artifacts" />
            <TypeMenu value={filter} onChange={p.onFilter} />
          </div>
        </Enter>
      )}

      <Enter delay={100} blur={false}>
        <div className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={filter}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        </div>
      </Enter>
    </div>
  );
}
