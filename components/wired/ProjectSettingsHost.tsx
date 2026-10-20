"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { getMemorySettings, copyYouIntoProject, hasYouFolder } from "@/lib/memory";
import { getProject, listProjectFiles, updateProject, type LibraryListing, type Project, type ProjectSettings as Settings } from "@/lib/projects";
import { settingsHref } from "@/lib/settingsOverlay";
import { loadConnectors, type UserConnector } from "@/lib/userConnectors";
import { listSkills, type Skill } from "@/lib/skills";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { host } from "@/components/app/settings/ConnectorParts";
import { ProjectSettings, type ProjectSettingsTab, type YouMode } from "@/components/app/project/ProjectSettings";

const NAME_MAX = 120;
const GOAL_MAX = 2000;

export function ProjectSettingsHost({
  projectId,
  tab,
  onTab,
  onClose,
  onDelete,
}: {
  projectId: string | null;
  tab: ProjectSettingsTab;
  onTab: (t: ProjectSettingsTab) => void;
  onClose: () => void;
  onDelete: (project: Project) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const { showError, showSuccess } = useToast();
  const [project, setProject] = React.useState<Project | null>(null);
  const [listing, setListing] = React.useState<LibraryListing | null>(null);
  const [connectors, setConnectors] = React.useState<UserConnector[]>([]);
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [youAvailable, setYouAvailable] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

  React.useEffect(() => {
    if (!projectId) return;
    let live = true;
    setProject(null);
    setListing(null);
    getProject(projectId)
      .then((p) => live && setProject(p))
      .catch(() => {
        showError("Failed to load project settings");
        onClose();
      });
    listProjectFiles(projectId).then((l) => live && setListing(l)).catch(() => {});
    loadConnectors().then((c) => live && setConnectors(c)).catch(() => {});
    listSkills().then((s) => live && setSkills(s)).catch(() => {});
    hasYouFolder().then((v) => live && setYouAvailable(v));
    return () => {
      live = false;
    };
  }, [projectId, onClose, showError]);

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!project) return;
    const settings = { ...project.settings, ...patch };
    setProject({ ...project, settings });
    try {
      setProject(await updateProject(project.id, { settings }));
    } catch {
      setProject(project);
      showError("Couldn't save project settings");
    }
  };

  const copyYou = async () => {
    if (!project) return;
    setCopying(true);
    try {
      const copy = await copyYouIntoProject(project.id, project.settings);
      await saveSettings({ you: "copy", ...copy });
      showSuccess("Copied into the project's memory");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't copy your memory");
    } finally {
      setCopying(false);
    }
  };

  const toggled = (ids: string[], id: string, on: boolean) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id));
  const openSettings = (target: "connectors" | "skills") => {
    onClose();
    router.push(settingsHref(pathname, target, new URLSearchParams(window.location.search)));
  };
  const shown = project ?? { name: "", goal: "", settings: null };
  const settings = project?.settings;
  const isFree = (user?.tier ?? "free") === "free";

  return (
    <ProjectSettings
      open={!!projectId}
      tab={tab}
      onTab={onTab}
      onClose={onClose}
      project={{ name: shown.name, goal: shown.goal }}
      nameMax={NAME_MAX}
      goalMax={GOAL_MAX}
      saving={saving}
      onSave={async (name, goal) => {
        if (!project) return;
        setSaving(true);
        try {
          setProject(await updateProject(project.id, { name, goal }));
          showSuccess("Project saved");
        } catch {
          showError("Couldn't save the project");
        } finally {
          setSaving(false);
        }
      }}
      storage={listing && { project: { used: listing.project.used, limit: listing.project.limit, files: listing.files.length, maxFiles: listing.maxFiles }, account: listing.account }}
      memory={{
        on: settings?.memory ?? true,
        onToggle: (on) => saveSettings({ memory: on }),
        you: settings?.you ?? "off",
        onYou: (mode: YouMode) => {
          if (mode === "copy" && !settings?.youCopiedAt) void copyYou();
          else void saveSettings({ you: mode });
        },
        copiedAt: settings?.youCopiedAt,
        copying,
        onCopyAgain: () => void copyYou(),
        youAvailable,
        mainMemoryOff: !getMemorySettings().enabled,
      }}
      connectors={{
        locked: isFree,
        items: connectors.map((c) => ({ id: c.id, name: c.name, host: host(c.url), logo: c.catalogId })),
        enabled: settings?.connectorIds ?? [],
        onToggle: (id, on) => void saveSettings({ connectorIds: toggled(settings?.connectorIds ?? [], id, on) }),
        onOpenConnectors: () => openSettings("connectors"),
        onUpgrade: () => {
          onClose();
          router.push("/plans");
        },
      }}
      skills={{
        items: skills.map(({ id, name, description }) => ({ id, name, description })),
        enabled: settings?.skillIds ?? [],
        onToggle: (id, on) => void saveSettings({ skillIds: toggled(settings?.skillIds ?? [], id, on) }),
        onOpenSkills: () => openSettings("skills"),
      }}
      onDelete={() => project && onDelete(project)}
    />
  );
}
