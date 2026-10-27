"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Chat } from "@/lib/chat/chat";
import type { Project } from "@/lib/projects/projects";
import { getSearchIndexState, searchMessages, subscribeSearchIndex, syncSearchIndex } from "@/lib/search/searchIndex";
import { setPendingFocus } from "@/lib/search/searchFocus";
import { fold, marked, matchesAll, searchTerms, snippet, type MarkedText } from "@/lib/search/searchText";
import {
  SearchPalette,
  type SearchChatHit,
  type SearchMessageGroup,
  type SearchProjectHit,
  type SearchTarget,
} from "@/components/app/SearchPalette";

const RECENT = 5;
const MAX_TITLE_HITS = 20;

const chatHref = (c: Chat): string => (c.project_id ? `/projects/${c.project_id}/${c.id}` : `/chat/${c.id}`);

export function SearchHost({ open, onClose, chats, projects }: { open: boolean; onClose: () => void; chats: Chat[]; projects: Project[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const terms = searchTerms(React.useDeferredValue(query));
  const termsKey = terms.join(" ");
  const index = React.useSyncExternalStore(subscribeSearchIndex, getSearchIndexState, getSearchIndexState);

  React.useEffect(() => {
    if (open) void syncSearchIndex(chats);
  }, [open, chats]);

  const close = () => {
    setQuery("");
    onClose();
  };

  const results = React.useMemo(() => {
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    const hitOf = (c: Chat, title: MarkedText): SearchChatHit => ({
      id: c.id,
      title,
      projectName: c.project_id ? (projectNames.get(c.project_id) ?? null) : null,
      updatedAt: c.updated_at ?? c.created_at,
    });
    const title = (c: Chat) => c.title || "New chat";
    const words = termsKey ? termsKey.split(" ") : [];

    const recent = chats.slice(0, RECENT).map((c) => hitOf(c, { text: title(c), ranges: [] }));
    if (!words.length) return { recent, projects: [], chats: [], messages: [] };

    const projectHits: SearchProjectHit[] = projects
      .filter((p) => matchesAll(fold(`${p.name}\n${p.goal}`), words))
      .map((p) => {
        const goal = snippet(p.goal, words);
        return { id: p.id, name: marked(p.name, words), goal: goal.ranges.length ? goal : undefined };
      });

    const titleHits = chats
      .filter((c) => matchesAll(fold(title(c)), words))
      .slice(0, MAX_TITLE_HITS)
      .map((c) => hitOf(c, marked(title(c), words)));

    const byId = new Map(chats.map((c) => [c.id, c]));
    const messageGroups: SearchMessageGroup[] = searchMessages(
      words,
      chats.map((c) => c.id),
    ).flatMap((g) => {
      const chat = byId.get(g.chatId);
      if (!chat) return [];
      return [
        {
          chat: hitOf(chat, marked(title(chat), words)),
          hits: g.hits.map((m) => ({ id: m.id, role: m.role, snippet: snippet(m.text, words, m.folded) })),
          more: g.more,
        },
      ];
    });

    return { recent, projects: projectHits, chats: titleHits, messages: messageGroups };
    // searchMessages reads the module's index; index.version is how a change to it reaches this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsKey, chats, projects, index.version]);

  const select = (target: SearchTarget) => {
    close();
    if (target.kind === "project") {
      router.push(`/projects/${target.id}`);
      return;
    }
    const chat = chats.find((c) => c.id === (target.kind === "chat" ? target.id : target.chatId));
    if (!chat) return;
    if (target.kind === "message") setPendingFocus({ chatId: chat.id, messageId: target.messageId, terms });
    router.push(chatHref(chat));
  };

  return (
    <SearchPalette
      open={open}
      onClose={close}
      query={query}
      onQueryChange={setQuery}
      recent={results.recent}
      projects={results.projects}
      chats={results.chats}
      messages={results.messages}
      indexing={index.progress}
      onSelect={select}
    />
  );
}
