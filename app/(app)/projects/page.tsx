"use client";

import { useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, uploadProjectFiles } from "@/lib/projects";
import { LIBRARY_LIMITS, fromDataTransfer, fromInput, prepareFiles, type PickedPath, type PreparedFile } from "@/lib/projectFiles";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { ProjectsView, type ProjectCardData } from "@/components/app/ProjectsView";
import { ProjectFormDialog, ProjectLimitDialog } from "@/components/app/ProjectDialogs";
import type { ContextSelection } from "@/components/app/project/Library";
import { LibraryContext } from "@/components/wired/useLibrary";
import { openProjectOn } from "@/components/wired/ProjectScreen";

const emptySelection: ContextSelection = { items: [], skipped: [] };

export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useSession();
  const { showError } = useToast();
  const { raw, loading, actions } = useContext(LibraryContext);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"create" | "limit" | null>(null);
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<ContextSelection>(emptySelection);
  const prepared = useRef(new Map<string, PreparedFile[]>());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const tier = (user?.tier ?? "free") === "pro" ? "pro" : "free";
  const cards = useMemo(
    () =>
      [...raw.projects]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map<ProjectCardData>((p) => ({ id: p.id, name: p.name, goal: p.goal, starred: p.starred, updatedAt: p.updated_at })),
    [raw.projects],
  );

  const q = query.trim().toLowerCase();
  const toSidebar = (p: ProjectCardData) => ({ id: p.id, name: p.name });

  const choose = async (picked: PickedPath[]) => {
    try {
      const ready = await prepareFiles(picked, (reading) => setSelection((s) => ({ ...s, reading: reading || undefined })));
      for (const [id, files] of ready.files) prepared.current.set(id, files);
      setSelection((s) => ({ items: [...s.items, ...ready.items], skipped: [...s.skipped, ...ready.skipped] }));
    } catch {
      showError("Couldn't read those files");
    }
  };

  const openCreate = () => {
    setSelection(emptySelection);
    prepared.current.clear();
    setDialog(tier === "free" && raw.projects.length >= 1 ? "limit" : "create");
  };

  return (
    <>
      <ProjectsView
        projects={q ? cards.filter((p) => p.name.toLowerCase().includes(q)) : cards}
        loading={loading}
        query={query}
        onQueryChange={setQuery}
        onNew={openCreate}
        actions={{
          onStar: (p) => actions?.onToggleStarProject(p.id),
          onEdit: (p) => actions?.onEditProject(toSidebar(p)),
          onDelete: (p) => actions?.onDeleteProject(toSidebar(p)),
        }}
      />
      <ProjectFormDialog
        open={dialog === "create"}
        saving={saving}
        progress={progress}
        onClose={() => setDialog(null)}
        onSubmit={async (draft) => {
          setSaving(true);
          let projectId: string | null = null;
          try {
            const project = await createProject(draft.name, draft.goal);
            projectId = project.id;
            window.dispatchEvent(new CustomEvent("karui-reload-projects"));
            const files = selection.items.flatMap((i) => prepared.current.get(i.id) ?? []);
            if (files.length > 0) {
              setSaving(false);
              await uploadProjectFiles(
                project.id,
                files.map((f) => ({ path: f.path, content: f.content, preview: f.preview })),
                (done, total) => setProgress({ done, total }),
              );
              openProjectOn(project.id, "library");
            }
            setDialog(null);
            router.push(`/projects/${project.id}`);
          } catch (error) {
            showError(error instanceof Error ? error.message : "Failed to create project");
            if (projectId) {
              setDialog(null);
              router.push(`/projects/${projectId}`);
            }
          } finally {
            setSaving(false);
            setProgress(null);
          }
        }}
        context={{
          selection,
          usage: { used: 0, files: 0, limit: LIBRARY_LIMITS[tier].bytes, maxFiles: LIBRARY_LIMITS[tier].files },
          plan: tier === "pro" ? "Pro" : "Free",
          onAddFiles: (files) => void choose(fromInput(files, false)),
          onAddFolder: (files) => void choose(fromInput(files, true)),
          onDropData: (data) => void fromDataTransfer(data).then(choose),
          onRemove: (id) => {
            prepared.current.delete(id);
            setSelection((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
          },
          onUpgrade: tier === "free" ? () => router.push("/plans") : undefined,
        }}
      />
      <ProjectLimitDialog open={dialog === "limit"} onClose={() => setDialog(null)} onUpgrade={() => router.push("/plans")} />
    </>
  );
}
