"use client";

import { Suspense, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArtifactsView, type ArtifactFilter } from "@/components/app/ArtifactsView";
import { ARTIFACT_TYPES, type ArtifactItem } from "@/components/app/artifacts/ArtifactGallery";
import { LibraryContext } from "@/components/wired/useLibrary";
import { setPendingFocus } from "@/lib/search/searchFocus";
import { getSearchIndexState, indexedArtifacts, subscribeSearchIndex, syncSearchIndex, type IndexedArtifact } from "@/lib/search/searchIndex";

const keyOf = (a: IndexedArtifact): string => `${a.chatId}:${a.path}`;

// The type filter lives in the URL (?type=), so the sidebar's type rows can open it.
function filterOf(type: string | null): ArtifactFilter {
  return ARTIFACT_TYPES.find((t) => t.id === type)?.id ?? "all";
}

export default function Artifacts() {
  return (
    <Suspense fallback={null}>
      <ArtifactsPage />
    </Suspense>
  );
}

function ArtifactsPage() {
  const router = useRouter();
  const filter = filterOf(useSearchParams().get("type"));
  const { raw, loading } = useContext(LibraryContext);
  const index = useSyncExternalStore(subscribeSearchIndex, getSearchIndexState, getSearchIndexState);
  const [query, setQuery] = useState("");
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (!loading) void syncSearchIndex(raw.chats);
  }, [loading, raw.chats, retries]);

  const chats = useMemo(() => new Map(raw.chats.map((c) => [c.id, c])), [raw.chats]);
  const projectNames = useMemo(() => new Map(raw.projects.map((p) => [p.id, p.name])), [raw.projects]);

  // `index` changes whenever the module store does, so the list is read again then.
  const indexed = useMemo(() => (index && indexedArtifacts()?.filter((a) => chats.has(a.chatId))) ?? null, [index, chats]);
  const syncing = index.progress !== null && !index.progress.paused;
  // A first sync shows nothing yet, so it reads as loading rather than as an empty page.
  const artifacts = indexed === null || (indexed.length === 0 && syncing) ? null : indexed;

  const items = useMemo(
    () =>
      (artifacts ?? []).map<ArtifactItem>((a) => {
        const projectId = chats.get(a.chatId)?.project_id;
        return {
          id: keyOf(a),
          title: a.title,
          type: a.type,
          path: a.path,
          source: a.content,
          version: a.version,
          projectName: projectId ? (projectNames.get(projectId) ?? null) : null,
          updatedAt: a.savedAt,
        };
      }),
    [artifacts, chats, projectNames],
  );

  const q = query.trim().toLowerCase();
  const shown = items.filter((a) => (filter === "all" || a.type === filter) && (!q || a.title.toLowerCase().includes(q)));

  const open = (item: ArtifactItem) => {
    const artifact = artifacts?.find((a) => keyOf(a) === item.id);
    const chat = artifact && chats.get(artifact.chatId);
    if (!artifact || !chat) return;
    setPendingFocus({ chatId: chat.id, messageId: artifact.messageId, terms: [], openArtifact: `${artifact.messageId}:${artifact.block}` });
    router.push(chat.project_id ? `/projects/${chat.project_id}/${chat.id}` : `/chat/${chat.id}`);
  };

  return (
    <ArtifactsView
      artifacts={loading ? null : artifacts && shown}
      total={items.length}
      error={!syncing && index.progress?.paused && items.length === 0}
      onRetry={() => setRetries((n) => n + 1)}
      filter={filter}
      onFilter={(f) => router.replace(f === "all" ? "/artifacts" : `/artifacts?type=${f}`, { scroll: false })}
      query={query}
      onQuery={setQuery}
      onOpen={open}
      onNew={() => router.push("/new")}
    />
  );
}
