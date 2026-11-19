"use client";

import * as React from "react";
import type { ComposerArtifact, ComposerArtifacts, SelectedArtifact } from "@/components/app/ComposerCommands";
import { getSearchIndexState, indexedArtifacts, subscribeSearchIndex, syncSearchIndex } from "@/lib/search/searchIndex";
import { LibraryContext } from "./useLibrary";

const idleIndex = { version: 0, progress: null };
const getIdleIndex = () => idleIndex;
const subscribeIdle = () => () => {};

export function useArtifactMentions(enabled: boolean): {
  props: ComposerArtifacts | undefined;
  selected: SelectedArtifact[];
  setSelected: (artifacts: SelectedArtifact[]) => void;
} {
  const { raw, loading } = React.useContext(LibraryContext);
  const [selected, setSelected] = React.useState<SelectedArtifact[]>([]);
  const [opened, setOpened] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const active = enabled && opened;
  const index = React.useSyncExternalStore(active ? subscribeSearchIndex : subscribeIdle, active ? getSearchIndexState : getIdleIndex, getIdleIndex);
  const open = React.useCallback(() => setOpened(true), []);

  React.useEffect(() => {
    if (active && !loading) void syncSearchIndex(raw.chats);
  }, [active, loading, raw.chats, attempt]);

  const items = React.useMemo((): ComposerArtifact[] | null => {
    if (!active || loading || index.version === 0) return null;
    const chats = new Map(raw.chats.map((chat) => [chat.id, chat]));
    const projects = new Map(raw.projects.map((project) => [project.id, project.name]));
    return indexedArtifacts()?.flatMap(({ chatId, path, title, type }) => {
      const chat = chats.get(chatId);
      if (!chat) return [];
      const detail = (chat.project_id && projects.get(chat.project_id)) || chat.title;
      return [{ chatId, path, title, type, detail }];
    }) ?? null;
  }, [active, index.version, loading, raw.chats, raw.projects]);

  const catalog: ComposerArtifacts["catalog"] = !items?.length && index.progress?.paused
    ? { status: "error", onRetry: () => setAttempt((n) => n + 1) }
    : !items || (!items.length && index.progress)
      ? { status: "loading" }
      : { status: "ready", items };

  return {
    props: enabled ? { catalog, selected, onChange: setSelected, onOpen: open } : undefined,
    selected: enabled ? selected : [],
    setSelected,
  };
}
