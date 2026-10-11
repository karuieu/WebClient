"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { deletionErrorText } from "@/lib/api";
import { getChats, deleteChat, renameChat, starChat, getMessages, type Chat, type Message } from "@/lib/chat";
import { parseMessageContent } from "@/lib/vision";
import {
  getProjects,
  starProject,
  deleteProject,
  assignChatToProject,
  unassignChatFromProject,
  type Project,
} from "@/lib/projects";
import { useToast } from "@/components/Toast";
import { ConfirmDeleteDialog, ProjectPickerDialog } from "@/components/app/Dialogs";
import type { ProjectSettingsTab } from "@/components/app/project/ProjectSettings";
import type { SidebarChat, SidebarProject } from "@/components/app/Sidebar";
import { ProjectSettingsHost } from "./ProjectSettingsHost";

type LibraryValue = {
  chats: SidebarChat[];
  raw: { chats: Chat[]; projects: Project[] };
  loading: boolean;
  actions: ReturnType<typeof useLibrary>["actions"] | null;
};

export const LibraryContext = React.createContext<LibraryValue>({
  chats: [],
  raw: { chats: [], projects: [] },
  loading: true,
  actions: null,
});

type Pending =
  | { kind: "delete-chat"; chats: Chat[]; preview: string | null }
  | { kind: "delete-project"; project: Project }
  | { kind: "move"; chats: Chat[]; projects: Project[] }
  | null;

async function firstUserMessage(chatId: string): Promise<string> {
  try {
    const messages = await getMessages(chatId);
    const userMsg = messages.find((m: Message) => m.role === "user");
    if (!userMsg) return "";
    const parsed = parseMessageContent(userMsg.content);
    return parsed.text || (parsed.images.length ? "(image attachment)" : parsed.files.length ? "(file attachment)" : "");
  } catch {
    return "";
  }
}

export function useLibrary() {
  const router = useRouter();
  const pathname = usePathname();
  const { showSuccess, showError } = useToast();
  const [chats, setChats] = React.useState<Chat[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState<Pending>(null);
  const [busy, setBusy] = React.useState(false);
  const [projectSettings, setProjectSettings] = React.useState<{ id: string; tab: ProjectSettingsTab } | null>(null);
  const closeProjectSettings = React.useCallback(() => setProjectSettings(null), []);


  const segments = pathname.split("/").filter(Boolean);
  const activeChatId = segments[0] === "chat" ? (segments[1] ?? null) : segments[0] === "projects" ? (segments[2] ?? null) : null;
  const activeProjectId = segments[0] === "projects" ? (segments[1] ?? null) : null;

  const load = React.useCallback(async () => {
    const [c, p] = await Promise.allSettled([getChats(), getProjects()]);
    if (p.status === "fulfilled") setProjects(p.value);
    else showError("Failed to load projects");
    if (c.status === "fulfilled") {
      setChats(
        [...c.value].sort(
          (a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime(),
        ),
      );
    } else showError("Failed to load chats");
    setLoading(false);
  }, [showError]);

  React.useEffect(() => {
    sessionStorage.removeItem("karui_reload_chats");
    load();
    const handler = () => load();
    window.addEventListener("karui-reload-chats", handler);
    window.addEventListener("karui-reload-projects", handler);
    return () => {
      window.removeEventListener("karui-reload-chats", handler);
      window.removeEventListener("karui-reload-projects", handler);
    };
  }, [load]);

  const pick = (ids: string[]) => chats.filter((c) => ids.includes(c.id));

  const moveChats = async (ids: string[]) => {
    const list = pick(ids);
    if (!list.length) return;
    const all = await getProjects().catch(() => projects);
    setPending({ kind: "move", chats: list, projects: all });
  };

  const deleteChats = async (ids: string[]) => {
    const list = pick(ids);
    if (!list.length) return;
    setPending({ kind: "delete-chat", chats: list, preview: list.length === 1 ? await firstUserMessage(list[0].id) : null });
  };
  const findProject = (id: string) => projects.find((p) => p.id === id);

  const actions = {
    onStarChat: async (c: SidebarChat) => {
      try {
        const { starred } = await starChat(c.id);
        setChats((all) => all.map((x) => (x.id === c.id ? { ...x, starred } : x)));
      } catch {
        showError("Failed to star chat");
      }
    },
    onRenameChat: async (c: SidebarChat, title: string) => {
      try {
        await renameChat(c.id, title);
        setChats((all) => all.map((x) => (x.id === c.id ? { ...x, title } : x)));
        window.dispatchEvent(new CustomEvent("karui-chat-renamed", { detail: { id: c.id, title } }));
      } catch {
        showError("Failed to rename chat");
      }
    },
    onMoveChat: (c: SidebarChat) => moveChats([c.id]),
    onDeleteChat: (c: SidebarChat) => deleteChats([c.id]),
    onMoveChats: moveChats,
    onDeleteChats: deleteChats,
    onUnstarProject: async (p: SidebarProject) => {
      try {
        await starProject(p.id);
        setProjects((all) => all.map((x) => (x.id === p.id ? { ...x, starred: false } : x)));
        window.dispatchEvent(new CustomEvent("karui-reload-projects"));
      } catch {
        showError("Failed to unstar project");
      }
    },
    onToggleStarProject: async (id: string) => {
      try {
        const { starred } = await starProject(id);
        setProjects((all) => all.map((x) => (x.id === id ? { ...x, starred } : x)));
        window.dispatchEvent(new CustomEvent("karui-reload-projects"));
      } catch {
        showError("Failed to star project");
      }
    },
    onEditProject: (p: SidebarProject) => setProjectSettings({ id: p.id, tab: "general" }),
    onOpenProjectSettings: (id: string, tab: ProjectSettingsTab = "general") => setProjectSettings({ id, tab }),
    onDeleteProject: (p: SidebarProject) => {
      const project = findProject(p.id);
      if (project) setPending({ kind: "delete-project", project });
    },
  };

  const close = () => {
    setBusy(false);
    setPending(null);
  };

  const dialogs = (
    <>
      <ConfirmDeleteDialog
        open={pending?.kind === "delete-chat" || pending?.kind === "delete-project"}
        onClose={close}
        deleting={busy}
        kind={pending?.kind === "delete-project" ? "project" : "chat"}
        count={pending?.kind === "delete-chat" ? pending.chats.length : 1}
        name={pending?.kind === "delete-chat" ? pending.chats[0].title || "New chat" : pending?.kind === "delete-project" ? pending.project.name : ""}
        preview={pending?.kind === "delete-chat" ? pending.preview : null}
        onConfirm={async () => {
          if (!pending) return;
          setBusy(true);
          if (pending.kind === "delete-chat") {
            const list = pending.chats;
            const results = await Promise.allSettled(list.map((c) => deleteChat(c.id)));
            const gone = list.filter((_, i) => results[i].status === "fulfilled").map((c) => c.id);
            const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
            setChats((all) => all.filter((x) => !gone.includes(x.id)));
            if (gone.length < list.length)
              showError(deletionErrorText(failure, list.length === 1 ? "Failed to delete chat" : "Some chats couldn't be deleted"));
            else showSuccess(list.length === 1 ? `Chat "${list[0].title || "New chat"}" deleted` : `${list.length} chats deleted`);
            if (activeChatId && gone.includes(activeChatId)) router.push(activeProjectId ? `/projects/${activeProjectId}` : "/new");
            load();
          } else if (pending.kind === "delete-project") {
            const { project } = pending;
            try {
              await deleteProject(project.id);
              setProjects((all) => all.filter((x) => x.id !== project.id));
              showSuccess(`Project "${project.name}" deleted`);
              window.dispatchEvent(new CustomEvent("karui-reload-projects"));
              setProjectSettings(null);
              if (activeProjectId === project.id) router.push("/projects");
            } catch (error) {
              showError(deletionErrorText(error, "Failed to delete project"));
            }
          }
          close();
        }}
      />
      <ProjectPickerDialog
        open={pending?.kind === "move"}
        onClose={close}
        moving={busy}
        chatTitle={pending?.kind === "move" ? (pending.chats.length === 1 ? pending.chats[0].title || "New chat" : `${pending.chats.length} chats`) : ""}
        currentProjectId={
          pending?.kind === "move" && pending.chats.every((c) => c.project_id === pending.chats[0].project_id)
            ? (pending.chats[0].project_id ?? null)
            : null
        }
        projects={pending?.kind === "move" ? pending.projects.map((p) => ({ id: p.id, name: p.name })) : []}
        onCreateProject={() => {
          close();
          router.push("/projects");
        }}
        onMove={async (projectId) => {
          if (pending?.kind !== "move") return;
          const list = pending.chats;
          setBusy(true);
          const results = await Promise.allSettled(
            list.map((c) =>
              projectId ? assignChatToProject(projectId, c.id) : c.project_id ? unassignChatFromProject(c.project_id, c.id) : Promise.resolve(),
            ),
          );
          const moved = list.filter((_, i) => results[i].status === "fulfilled").map((c) => c.id);
          setChats((all) => all.map((x) => (moved.includes(x.id) ? { ...x, project_id: projectId ?? undefined } : x)));
          if (moved.length < list.length) showError(projectId ? "Failed to add to project" : "Failed to remove from project");
          window.dispatchEvent(new CustomEvent("karui-reload-projects"));
          close();
        }}
      />
      <ProjectSettingsHost
        projectId={projectSettings?.id ?? null}
        tab={projectSettings?.tab ?? "general"}
        onTab={(tab) => setProjectSettings((cur) => cur && { ...cur, tab })}
        onClose={closeProjectSettings}
        onDelete={(project) => setPending({ kind: "delete-project", project })}
      />
    </>
  );

  const section: "new" | "chats" | "projects" | null = pathname.startsWith("/new")
    ? "new"
    : pathname.startsWith("/chats")
      ? "chats"
      : pathname.startsWith("/projects")
        ? "projects"
        : null;

  return {
    chats: chats.map<SidebarChat>((c) => ({
      id: c.id,
      title: c.title || "New chat",
      starred: c.starred,
      projectId: c.project_id,
      projectName: c.project_id ? findProject(c.project_id)?.name : undefined,
    })),
    starredProjects: projects.filter((p) => p.starred).map<SidebarProject>((p) => ({ id: p.id, name: p.name })),
    raw: { chats, projects },
    loading,
    active: { section, chatId: activeChatId, projectId: activeProjectId },
    actions,
    dialogs,
  };
}
