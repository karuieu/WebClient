"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  assignChatToProject,
  createProjectMemoryFile,
  deleteFileVersion,
  deleteProjectFiles,
  deleteProjectMemoryFile,
  getProject,
  keepFileVersion,
  listFileVersions,
  listProjectFiles,
  listProjectMemory,
  ProjectApiError,
  readFileVersion,
  readProjectFiles,
  unassignChatFromProject,
  updateProjectFile,
  updateProjectMemoryFile,
  uploadProjectFiles,
  type LibraryFileMeta,
  type LibraryListing,
  type Project,
  type ProjectMemoryFile,
} from "@/lib/projects";
import { LIBRARY_LIMITS, fromDataTransfer, fromInput, prepareFiles, previewOf, type PickedPath, type PreparedFile } from "@/lib/projectFiles";
import { useTabTitle } from "@/lib/tabTitle";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import type { HeaderProject } from "@/components/app/chat/ChatView";
import { ConfirmDeleteDialog } from "@/components/app/Dialogs";
import { deletionErrorText } from "@/lib/api";
import { AddChatsDialog } from "@/components/app/ProjectDialogs";
import { AddToLibraryDialog, type ContextSelection, type LibraryFile } from "@/components/app/project/Library";
import type { FileVersionItem, FileVersionsProps } from "@/components/app/project/FileVersions";
import { artifactTypeOf } from "@/lib/artifacts";
import type { OpenLibraryItem, PanelChat, PanelView, ProjectPanelProps } from "@/components/app/project/ProjectPanel";
import { ProjectWorkspace, useProjectPanel } from "@/components/app/project/ProjectWorkspace";
import { LibraryContext } from "./useLibrary";

export type ProjectLibrary = {
  /** null while the Library loads, so chat cards don't flash "not in the Library". */
  paths: ReadonlySet<string> | null;
  open: (path: string) => void;
};

export type ProjectFrame = {
  project: Project | null;
  header: HeaderProject;
  libraryNote?: string;
  library: ProjectLibrary;
  setDocumentOpen: (open: boolean) => void;
  openSettings: () => void;
};

export const ProjectFrameContext = React.createContext<ProjectFrame | null>(null);

const nextView = new Map<string, PanelView>();
export function openProjectOn(projectId: string, view: PanelView) {
  nextView.set(projectId, view);
}

const emptySelection: ContextSelection = { items: [], skipped: [] };

function asLibraryFile(meta: LibraryFileMeta): LibraryFile {
  return { id: meta.id, path: meta.path, size: meta.size, version: meta.version, kept: meta.kept };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProjectScreen({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const { showError, showSuccess } = useToast();
  const library = React.useContext(LibraryContext);
  const panel = useProjectPanel();

  const [view, setView] = React.useState<PanelView>(() => nextView.get(projectId) ?? "chats");
  const [project, setProject] = React.useState<Project | null>(null);
  const [listing, setListing] = React.useState<LibraryListing | null>(null);
  const [memory, setMemory] = React.useState<ProjectMemoryFile[] | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [open, setOpen] = React.useState<OpenLibraryItem | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [documentOpen, setDocumentOpen] = React.useState(false);
  const [selection, setSelection] = React.useState<ContextSelection | null>(null);
  const prepared = React.useRef(new Map<string, PreparedFile[]>());
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [deleting, setDeleting] = React.useState<{ ids: string[]; label: string; kind: "file" | "memory" | "version" } | null>(null);
  const [versionList, setVersionList] = React.useState<FileVersionItem[] | null>(null);
  const [versionsFailed, setVersionsFailed] = React.useState(false);
  const [viewing, setViewing] = React.useState<FileVersionsProps["viewing"]>(null);
  const [restoring, setRestoring] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [addingChats, setAddingChats] = React.useState(false);

  React.useEffect(() => {
    nextView.delete(projectId);
  }, [projectId]);

  const loadProject = React.useCallback(() => {
    getProject(projectId)
      .then((p) => {
        setProject(p);
        setLoadFailed(false);
      })
      .catch((error) => {
        if (error instanceof ProjectApiError && error.status === 404) {
          showError("This project doesn't exist anymore");
          router.replace("/projects");
        } else setLoadFailed(true);
      });
  }, [projectId, router, showError]);
  const loadFiles = React.useCallback(() => {
    listProjectFiles(projectId).then(setListing).catch(() => setLoadFailed(true));
  }, [projectId]);
  const loadMemory = React.useCallback(() => {
    listProjectMemory(projectId).then(setMemory).catch(() => setLoadFailed(true));
  }, [projectId]);

  React.useEffect(() => {
    loadProject();
    loadFiles();
    loadMemory();
    const mine = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; projectId?: string }>).detail;
      return !detail || detail.id === projectId || detail.projectId === projectId;
    };
    const onProject = (e: Event) => mine(e) && loadProject();
    const onFiles = (e: Event) => mine(e) && loadFiles();
    const onMemory = (e: Event) => mine(e) && loadMemory();
    window.addEventListener("karui-reload-projects", onProject);
    window.addEventListener("karui-project-files-updated", onFiles);
    window.addEventListener("karui-project-memory-updated", onMemory);
    return () => {
      window.removeEventListener("karui-reload-projects", onProject);
      window.removeEventListener("karui-project-files-updated", onFiles);
      window.removeEventListener("karui-project-memory-updated", onMemory);
    };
  }, [loadProject, loadFiles, loadMemory, projectId]);

  const segments = pathname.split("/").filter(Boolean);
  const activeChatId = segments[0] === "projects" && segments[1] === projectId ? (segments[2] ?? null) : null;
  useTabTitle(project?.name, "Project", !activeChatId);

  const chats = React.useMemo<PanelChat[] | null>(
    () =>
      library.loading
        ? null
        : library.raw.chats
            .filter((c) => c.project_id === projectId)
            .map((c) => ({ id: c.id, title: c.title || "New chat", brief: c.brief, starred: c.starred, updatedAt: c.updated_at ?? c.created_at })),
    [library.loading, library.raw.chats, projectId],
  );
  const asSidebar = (c: PanelChat) => ({ id: c.id, title: c.title, starred: c.starred, projectId });

  const libraryPaths = React.useMemo(() => listing && new Set(listing.files.map((f) => f.path)), [listing]);

  const tier = (user?.tier ?? "free") === "pro" ? "pro" : "free";
  const usage = listing
    ? { used: listing.project.used, limit: listing.project.limit, files: listing.files.length, maxFiles: listing.maxFiles }
    : { used: 0, limit: LIBRARY_LIMITS[tier].bytes, files: 0, maxFiles: LIBRARY_LIMITS[tier].files };

  const choose = async (picked: PickedPath[]) => {
    setSelection((s) => s ?? emptySelection);
    try {
      const ready = await prepareFiles(picked, (reading) => setSelection((s) => ({ ...(s ?? emptySelection), reading: reading || undefined })));
      for (const [id, files] of ready.files) prepared.current.set(id, files);
      setSelection((s) => ({ items: [...(s?.items ?? []), ...ready.items], skipped: [...(s?.skipped ?? []), ...ready.skipped] }));
    } catch {
      showError("Couldn't read those files");
    }
  };

  const closeSelection = () => {
    setSelection(null);
    prepared.current.clear();
  };

  const addSelection = async () => {
    if (!selection) return;
    const files = selection.items.flatMap((i) => prepared.current.get(i.id) ?? []);
    try {
      await uploadProjectFiles(
        projectId,
        files.map((f) => ({ path: f.path, content: f.content, preview: f.preview })),
        (done, total) => setProgress({ done, total }),
      );
      closeSelection();
      showSuccess(files.length === 1 ? "Added to the Library" : `${files.length} files added to the Library`);
    } catch (error) {
      showError(errorMessage(error, "Couldn't add the files"));
    } finally {
      setProgress(null);
    }
  };

  const openFile = (id: string) => {
    const meta = listing?.files.find((f) => f.id === id);
    if (!meta) return;
    setView("library");
    setVersionList(null);
    setViewing(null);
    setOpen({ kind: "file", file: asLibraryFile(meta), content: null });
    readProjectFiles(projectId, [meta])
      .then((contents) => {
        const content = contents.get(meta.id);
        setOpen((o) =>
          o?.kind === "file" && o.file.id === meta.id
            ? content === undefined
              ? { ...o, error: "This file isn't in the Library anymore." }
              : { ...o, content }
            : o,
        );
      })
      .catch(() => setOpen((o) => (o?.kind === "file" && o.file.id === meta.id ? { ...o, error: "This file couldn't be opened or decrypted." } : o)));
  };

  const openMemory = (f: ProjectMemoryFile) =>
    setOpen({ kind: "memory", file: { id: f.id, name: f.name, description: f.description, content: f.content, fromYou: project?.settings.youCopyIds.includes(f.id) } });

  const conflict = (error: unknown) => error instanceof ProjectApiError && error.status === 409;

  // `restart` starts the editor afresh, for content replaced outside it (a restored version).
  const showSaved = (meta: LibraryFileMeta, content?: string, restart = false) => {
    setListing((l) => l && { ...l, files: l.files.map((f) => (f.id === meta.id ? meta : f)) });
    setOpen((o) =>
      o?.kind === "file" && o.file.id === meta.id
        ? { ...o, file: asLibraryFile(meta), content: content ?? o.content, revision: restart ? (o.revision ?? 0) + 1 : o.revision }
        : o,
    );
  };

  const openMeta = open?.kind === "file" ? listing?.files.find((f) => f.id === open.file.id) : undefined;
  const versions: FileVersionsProps | undefined = openMeta && {
    list: versionList,
    error: versionsFailed,
    viewing,
    restoring,
    onLoad: () => {
      setVersionsFailed(false);
      listFileVersions(projectId, openMeta.id).then(
        (list) => setVersionList(list.map((v) => ({ id: v.id, number: v.number, savedAt: v.saved_at, size: v.size, kept: v.kept }))),
        () => setVersionsFailed(true),
      );
    },
    onView: (v) => {
      if (!v) return setViewing(null);
      setViewing({ version: v, content: null, error: false });
      readFileVersion(projectId, openMeta.id, v.id).then(
        (content) => setViewing((o) => (o?.version.id === v.id ? { ...o, content } : o)),
        () => setViewing((o) => (o?.version.id === v.id ? { ...o, error: true } : o)),
      );
    },
    onRestore: async (v) => {
      const content = viewing?.version.id === v.id ? viewing.content : null;
      if (content === null) return;
      setRestoring(true);
      try {
        showSaved(await updateProjectFile(projectId, openMeta, content, previewOf(content), true), content, true);
        setViewing(null);
        setVersionList(null);
      } catch (error) {
        showError(conflict(error) ? "This file changed elsewhere. Close it and open it again." : errorMessage(error, "Couldn't restore that version"));
      } finally {
        setRestoring(false);
      }
    },
    onDelete: (v) => setDeleting({ ids: [v.id], label: `v${v.number} of ${openMeta.path.split("/").pop()}`, kind: "version" }),
    onKeep: () =>
      void keepFileVersion(projectId, openMeta.id).then(
        (meta) => showSaved(meta),
        (error: unknown) => showError(errorMessage(error, "Couldn't keep this version")),
      ),
  };

  const panelProps: ProjectPanelProps = {
    error: loadFailed ? { message: "This project's chats and Library couldn't be loaded.", onRetry: () => (loadProject(), loadFiles(), loadMemory()) } : null,
    view,
    onView: setView,
    chats,
    activeChatId,
    newChatHref: `/projects/${projectId}`,
    chatHref: (id) => `/projects/${projectId}/${id}`,
    chatActions: {
      onStar: (c) => library.actions?.onStarChat(asSidebar(c)),
      onRename: (c, title) => library.actions?.onRenameChat(asSidebar(c), title),
      onRemove: async (c) => {
        try {
          await unassignChatFromProject(projectId, c.id);
          window.dispatchEvent(new CustomEvent("karui-reload-chats"));
          if (activeChatId === c.id) router.push(`/chat/${c.id}`);
        } catch {
          showError("Couldn't remove the chat from the project");
        }
      },
      onDelete: (c) => library.actions?.onDeleteChat(asSidebar(c)),
      onAddExisting: () => setAddingChats(true),
    },
    library: {
      memory: memory && memory.map((f) => ({ id: f.id, name: f.name, description: f.description, content: f.content, fromYou: project?.settings.youCopyIds.includes(f.id) })),
      memoryOn: project?.settings.memory ?? true,
      you: project?.settings.you ?? "off",
      files: listing && listing.files.map(asLibraryFile),
      usage: listing ? usage : null,
      uploading: selection ? null : progress,
      open,
      saving,
      onOpenMemoryFile: (f) => {
        const file = memory?.find((m) => m.id === f.id);
        if (file) openMemory(file);
      },
      onAddMemoryFile: async (name) => {
        try {
          const file = await createProjectMemoryFile(projectId, name, "", "");
          setMemory((m) => [...(m ?? []), file]);
          openMemory(file);
        } catch (error) {
          showError(errorMessage(error, "Couldn't add the memory file"));
        }
      },
      onSaveMemoryFile: async (id, patch) => {
        const file = memory?.find((m) => m.id === id);
        if (!file) return;
        setSaving(true);
        try {
          const saved = await updateProjectMemoryFile(projectId, id, patch.name, patch.description, patch.content, file.updated_at);
          setMemory((m) => (m ?? []).map((x) => (x.id === id ? saved : x)));
          setOpen((o) => (o?.kind === "memory" && o.file.id === id ? { ...o, file: { ...o.file, ...patch } } : o));
        } catch (error) {
          showError(conflict(error) ? "This file changed elsewhere. Close it and open it again." : "Couldn't save the file");
        } finally {
          setSaving(false);
        }
      },
      onDeleteMemoryFile: (f) => setDeleting({ ids: [f.id], label: f.name, kind: "memory" }),
      onMemorySettings: () => library.actions?.onOpenProjectSettings(projectId, "memory"),
      onOpenFile: (f) => openFile(f.id),
      onSaveFile: async (id, content) => {
        const meta = listing?.files.find((f) => f.id === id);
        if (!meta) return;
        setSaving(true);
        try {
          showSaved(await updateProjectFile(projectId, meta, content, previewOf(content), artifactTypeOf(meta.path) !== null), content);
          setVersionList(null);
        } catch (error) {
          showError(conflict(error) ? "This file changed elsewhere. Close it and open it again." : errorMessage(error, "Couldn't save the file"));
        } finally {
          setSaving(false);
        }
      },
      onRetryOpen: () => open?.kind === "file" && openFile(open.file.id),
      onCloseItem: () => setOpen(null),
      versions,
      onDeleteFiles: (ids, label) => setDeleting({ ids, label, kind: "file" }),
      onAddFiles: (files) => void choose(fromInput(files, false)),
      onAddFolder: (files) => void choose(fromInput(files, true)),
      onDropData: (data) => void fromDataTransfer(data).then(choose),
    },
  };

  const header: HeaderProject = {
    name: project?.name ?? "",
    href: `/projects/${projectId}`,
    panelOpen: !panel.hidden && !documentOpen,
    onTogglePanel: panel.toggle,
    onOpenSettings: () => library.actions?.onOpenProjectSettings(projectId, "general"),
  };

  const frame: ProjectFrame = {
    project,
    header,
    libraryNote: listing?.files.length ? `${listing.files.length} ${listing.files.length === 1 ? "file" : "files"} in the Library` : undefined,
    library: {
      paths: libraryPaths,
      open: (path) => {
        const meta = listing?.files.find((f) => f.path === path);
        if (!meta) return;
        panel.show();
        openFile(meta.id);
      },
    },
    setDocumentOpen,
    openSettings: () => library.actions?.onOpenProjectSettings(projectId, "general"),
  };

  const assignable = library.raw.chats
    .filter((c) => c.project_id !== projectId)
    .map((c) => ({ id: c.id, title: c.title || "New chat", meta: c.project_id ? library.raw.projects.find((p) => p.id === c.project_id)?.name : undefined }));

  return (
    <ProjectFrameContext.Provider value={frame}>
      <ProjectWorkspace state={panel} panel={panelProps} suspended={documentOpen}>
        {children}
      </ProjectWorkspace>

      <AddToLibraryDialog
        open={!!selection}
        onClose={() => !progress && closeSelection()}
        onAdd={() => void addSelection()}
        progress={selection ? progress : null}
        selection={selection ?? emptySelection}
        usage={usage}
        plan={tier === "pro" ? "Pro" : "Free"}
        onAddFiles={(files) => void choose(fromInput(files, false))}
        onAddFolder={(files) => void choose(fromInput(files, true))}
        onDropData={(data) => void fromDataTransfer(data).then(choose)}
        onRemove={(id) => {
          prepared.current.delete(id);
          setSelection((s) => s && { ...s, items: s.items.filter((i) => i.id !== id) });
        }}
        onUpgrade={tier === "free" ? () => router.push("/plans") : undefined}
      />

      <ConfirmDeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        deleting={busy}
        kind={deleting?.kind === "version" ? "version" : "file"}
        name={deleting?.label ?? ""}
        count={deleting?.ids.length}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            if (deleting.kind === "version" && openMeta) {
              await deleteFileVersion(projectId, openMeta.id, deleting.ids[0]);
              setVersionList((all) => all && all.filter((v) => v.id !== deleting.ids[0]));
              setViewing(null);
            } else if (deleting.kind === "memory") {
              await deleteProjectMemoryFile(projectId, deleting.ids[0]);
              setMemory((m) => (m ?? []).filter((x) => !deleting.ids.includes(x.id)));
            } else {
              await deleteProjectFiles(projectId, deleting.ids);
            }
            if (open && deleting.ids.includes(open.file.id)) setOpen(null);
          } catch (error) {
            showError(deletionErrorText(error, "Couldn't delete that"));
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
      />

      <AddChatsDialog
        open={addingChats}
        onClose={() => setAddingChats(false)}
        projectName={project?.name ?? ""}
        chats={assignable}
        onAdd={async (ids) => {
          const results = await Promise.allSettled(ids.map((id) => assignChatToProject(projectId, id)));
          if (results.some((r) => r.status === "rejected")) showError("Some chats couldn't be added");
          window.dispatchEvent(new CustomEvent("karui-reload-chats"));
          setAddingChats(false);
        }}
      />
    </ProjectFrameContext.Provider>
  );
}
