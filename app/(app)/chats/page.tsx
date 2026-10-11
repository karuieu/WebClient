"use client";

import { useContext, useMemo, useState } from "react";
import { ChatsView, type ChatsListItem } from "@/components/app/ChatsView";
import { LibraryContext } from "@/components/wired/useLibrary";

const PAGE = 30;

export default function ChatsPage() {
  const { raw, loading, actions } = useContext(LibraryContext);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const items = useMemo(() => {
    const names = new Map(raw.projects.map((p) => [p.id, p.name]));
    return raw.chats.map<ChatsListItem>((c) => ({
      id: c.id,
      title: c.title || "New chat",
      starred: c.starred,
      projectName: c.project_id ? (names.get(c.project_id) ?? null) : null,
      updatedAt: c.updated_at ?? c.created_at,
    }));
  }, [raw]);

  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((c) => c.title.toLowerCase().includes(q)) : items;

  return (
    <ChatsView
      chats={matches.slice(0, shown)}
      total={items.length}
      loading={loading}
      query={query}
      onQueryChange={(v) => {
        setQuery(v);
        setShown(PAGE);
      }}
      hasMore={matches.length > shown}
      onShowMore={() => setShown((n) => n + PAGE)}
      actions={{
        onStar: (c) => actions?.onStarChat({ id: c.id, title: c.title, starred: c.starred }),
        onRename: (c, t) => actions?.onRenameChat({ id: c.id, title: c.title, starred: c.starred }, t),
        onMove: (list) => actions?.onMoveChats(list.map((c) => c.id)),
        onDelete: (list) => actions?.onDeleteChats(list.map((c) => c.id)),
      }}
    />
  );
}
