"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { apiJSON, deletionErrorText } from "@/lib/core/api";
import { CUSTOM_INSTRUCTIONS_MAX_CHARS, getCustomInstructionsDoc, saveCustomInstructions } from "@/lib/chat/customInstructions";
import {
  createMemoryCategory,
  createMemoryFile,
  deleteMemoryCategory,
  deleteMemoryFile,
  getMemorySettings,
  getMemoryTree,
  renameMemoryCategory,
  setMemorySettings,
  updateMemoryFile,
  type MemoryCategory,
  type MemorySettings as MemoryPrefsState,
} from "@/lib/chat/memory";
import { addConnector, connectCatalogConnector, loadConnectors, removeConnector, updateConnector, type UserConnector } from "@/lib/connectors/userConnectors";
import { CONNECTOR_CATALOG, defaultRoute } from "@/lib/connectors/connectors";
import { openSignInWindow } from "@/lib/connectors/mcpOAuth";
import { getToolApprovalMode, setToolApprovalMode, type ToolApprovalMode } from "@/lib/connectors/toolApproval";
import { createSkill, deleteSkill, listSkills, setSkillEnabled, SKILL_COUNT_LIMIT, SKILL_LIMITS, updateSkill, type Skill } from "@/lib/chat/skills";
import { offerDraft } from "@/lib/ui/draftRescue";
import { WORKSPACE_TABS, WorkspaceView, type WorkspaceTab } from "@/components/app/WorkspaceView";
import { MemoryFiles } from "@/components/app/settings/Memory";
import { ConnectError, ConnectorsSettings, type ConnectorItem } from "@/components/app/settings/Connectors";
import { SkillsSettings } from "@/components/app/settings/Skills";
import { InstructionsSettings } from "@/components/app/settings/Instructions";

export const WORKSPACE_NAME = "Workspace";
export const WORKSPACE_PATH = "/workspace";

export function workspaceHref(tab: WorkspaceTab): string {
  return `${WORKSPACE_PATH}?tab=${tab}`;
}

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  return WORKSPACE_TABS.some((t) => t.id === value);
}

// Both start a chat with the request already typed, so "Save when I ask" and the skill writer take it from there.
const CREATE_SKILL_STARTER = "Help me write a skill:";
const REMEMBER_STARTER = "Remember that ";

function startChat(router: ReturnType<typeof useRouter>, draft: string): void {
  offerDraft(draft);
  router.push("/new");
}

function InstructionsSection() {
  const { showSuccess, showError } = useToast();
  const [instructions, setInstructions] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getCustomInstructionsDoc()
      .then((doc) => setInstructions(doc.content))
      .catch(() => {});
  }, []);

  return (
    <InstructionsSettings
      instructions={instructions}
      max={CUSTOM_INSTRUCTIONS_MAX_CHARS}
      saving={saving}
      onSave={async (text) => {
        setSaving(true);
        try {
          setInstructions((await saveCustomInstructions(text)).content);
          showSuccess("Instructions saved");
        } catch {
          showError("Failed to save instructions");
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}

function SkillsSection({ onCreateWithKarui }: { onCreateWithKarui: () => void }) {
  const { user } = useSession();
  const { showSuccess, showError } = useToast();
  const [skills, setSkills] = React.useState<Skill[] | null>(null);

  React.useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch(() => {
        setSkills([]);
        showError("Failed to load skills");
      });
  }, [showError]);

  const put = (skill: Skill) =>
    setSkills((all) => [...(all ?? []).filter((s) => s.id !== skill.id), skill].sort((a, b) => a.name.localeCompare(b.name)));

  return (
    <SkillsSettings
      skills={skills}
      limits={{ ...SKILL_LIMITS, skills: SKILL_COUNT_LIMIT[user?.tier === "pro" ? "pro" : "free"] }}
      onCreate={async (fields) => {
        try {
          put(await createSkill(fields));
          showSuccess("Skill saved");
        } catch (error) {
          showError(error instanceof Error ? error.message : "Failed to save skill");
        }
      }}
      onUpdate={async (id, fields) => {
        try {
          put(await updateSkill(id, fields, skills?.find((s) => s.id === id)?.updatedAt));
          showSuccess("Skill saved");
        } catch (error) {
          showError(error instanceof Error ? error.message : "Failed to save skill");
        }
      }}
      onToggle={async (id, enabled) => {
        try {
          put(await setSkillEnabled(id, enabled));
        } catch {
          showError("Failed to update skill");
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteSkill(id);
          setSkills((all) => (all ?? []).filter((s) => s.id !== id));
        } catch (error) {
          showError(deletionErrorText(error, "Failed to delete skill"));
        }
      }}
      onCreateWithKarui={onCreateWithKarui}
    />
  );
}

function abilitiesOf(c: UserConnector): ConnectorItem["abilities"] {
  return c.tools.map((t) => ({ label: t.title || t.name, changes: !t.readOnly }));
}

// Catalog entries keep their catalog id, so the tile finds the logo; connectors added by address keep their own.
function connectorItems(connectors: UserConnector[], clientIds: Record<string, string>): ConnectorItem[] {
  const catalog = CONNECTOR_CATALOG.map((info): ConnectorItem => {
    const mine = connectors.find((c) => c.catalogId === info.id);
    return {
      ...info,
      status: !mine ? "available" : mine.signedOut ? "expired" : "connected",
      route: mine?.route ?? defaultRoute(info),
      abilities: mine && info.api !== "docs" ? abilitiesOf(mine) : info.abilities,
      ready: !info.app || !!clientIds[info.app],
    };
  });
  const own = connectors
    .filter((c) => !c.catalogId)
    .map((c): ConnectorItem => ({
      id: c.id,
      name: c.name,
      description: "",
      url: c.url,
      browser: true,
      abilities: abilitiesOf(c),
      status: "connected",
      route: c.route,
      custom: true,
    }));
  return [...catalog, ...own];
}

function ConnectorsSection({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useSession();
  const { showError } = useToast();
  const [connectors, setConnectors] = React.useState<UserConnector[] | null>(null);
  const [clientIds, setClientIds] = React.useState<Record<string, string>>({});
  const [approval, setApproval] = React.useState<ToolApprovalMode>(() => getToolApprovalMode());
  const locked = (user?.tier ?? "free") !== "pro";

  React.useEffect(() => {
    loadConnectors()
      .then(setConnectors)
      .catch(() => setConnectors([]));
  }, []);

  React.useEffect(() => {
    if (locked) return;
    apiJSON<{ client_ids: Record<string, string> }>("/api/connectors/apps")
      .then((apps) => setClientIds(apps.client_ids))
      .catch(() => {});
  }, [locked]);

  if (!locked && connectors === null) return null;
  const list = connectors ?? [];
  const find = (id: string) => list.find((c) => c.id === id || c.catalogId === id);

  return (
    <ConnectorsSettings
      locked={locked}
      onUpgrade={onUpgrade}
      connectors={connectorItems(list, clientIds)}
      approval={{
        mode: approval,
        onChange: (mode) => {
          setToolApprovalMode(mode);
          setApproval(mode);
        },
      }}
      onAdd={async (c) => {
        await addConnector(c);
        setConnectors(await loadConnectors());
      }}
      onConnect={async (id, route, signal) => {
        const info = CONNECTOR_CATALOG.find((c) => c.id === id);
        if (!info) return;
        const popup = openSignInWindow();
        if (!popup) throw new ConnectError("Your browser blocked the sign-in window. Allow pop-ups for Karui and try again.");
        try {
          setConnectors(await connectCatalogConnector({ info, route, popup, signal }));
        } catch (error) {
          throw new ConnectError(error instanceof Error ? error.message : `Couldn't connect ${info.name}.`, info.notice?.href);
        } finally {
          popup.close();
        }
      }}
      onRoute={(id, route) => {
        const connector = find(id);
        if (!connector) return;
        updateConnector(connector.id, { route })
          .then(setConnectors)
          .catch(() => showError("Couldn't save that change"));
      }}
      onDisconnect={(id) => {
        const connector = find(id);
        if (!connector) return;
        removeConnector(connector.id)
          .then(setConnectors)
          .catch(() => showError("Couldn't remove the connector"));
      }}
    />
  );
}

function MemorySection({ onTalkWithKarui }: { onTalkWithKarui: () => void }) {
  const { showSuccess, showError } = useToast();
  const [prefs, setPrefs] = React.useState<MemoryPrefsState>(() => getMemorySettings());
  const [tree, setTree] = React.useState<MemoryCategory[] | null>(null);

  React.useEffect(() => {
    getMemoryTree()
      .then(setTree)
      .catch(() => {
        setTree([]);
        showError("Failed to load memory");
      });
    const onUpdated = () => getMemoryTree().then(setTree).catch(() => {});
    window.addEventListener("karui-memory-updated", onUpdated);
    return () => window.removeEventListener("karui-memory-updated", onUpdated);
  }, [showError]);

  const patchFiles = (fn: (c: MemoryCategory) => MemoryCategory) => setTree((t) => (t ?? []).map(fn));

  return (
    <MemoryFiles
      categories={
        tree &&
        tree.map((c) => ({
          id: c.id,
          name: c.name,
          undecryptable: c.undecryptable,
          files: c.files.map((f) => ({ id: f.id, name: f.name, description: f.description, content: f.content, undecryptable: f.undecryptable })),
        }))
      }
      off={!prefs.enabled}
      onTurnOn={() => setPrefs(setMemorySettings({ enabled: true }))}
      onTalkWithKarui={onTalkWithKarui}
      actions={{
        createCategory: async (name) => {
          try {
            const category = await createMemoryCategory(name.trim());
            setTree((t) => [...(t ?? []), category]);
          } catch {
            showError("Failed to create category");
          }
        },
        renameCategory: async (id, name) => {
          try {
            await renameMemoryCategory(id, name.trim());
            patchFiles((c) => (c.id === id ? { ...c, name: name.trim() } : c));
          } catch {
            showError("Failed to rename category");
          }
        },
        deleteCategory: async (id) => {
          try {
            await deleteMemoryCategory(id);
            setTree((t) => (t ?? []).filter((c) => c.id !== id));
          } catch (error) {
            showError(deletionErrorText(error, "Failed to delete category"));
          }
        },
        createFile: async (categoryId, name, description) => {
          try {
            const file = await createMemoryFile(categoryId, name.trim(), description.trim(), "");
            patchFiles((c) => (c.id === categoryId ? { ...c, files: [...c.files, file] } : c));
            return file.id;
          } catch {
            showError("Failed to create file");
            return null;
          }
        },
        updateFile: async (id, patch) => {
          try {
            const read = tree?.flatMap((c) => c.files).find((f) => f.id === id)?.updatedAt;
            const updated = await updateMemoryFile(id, patch.name.trim(), patch.description.trim(), patch.content, read);
            patchFiles((c) => ({ ...c, files: c.files.map((f) => (f.id === id ? updated : f)) }));
            showSuccess("File saved");
          } catch (error) {
            showError(error instanceof Error ? error.message : "Failed to save file");
          }
        },
        deleteFile: async (id) => {
          try {
            await deleteMemoryFile(id);
            patchFiles((c) => ({ ...c, files: c.files.filter((f) => f.id !== id) }));
          } catch (error) {
            showError(deletionErrorText(error, "Failed to delete file"));
          }
        },
      }}
    />
  );
}

export function WorkspacePage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: WorkspaceTab = isWorkspaceTab(requested) ? requested : "skills";

  return (
    <WorkspaceView
      title={WORKSPACE_NAME}
      tab={tab}
      onTab={(t) => router.replace(workspaceHref(t), { scroll: false })}
      sections={{
        skills: <SkillsSection onCreateWithKarui={() => startChat(router, CREATE_SKILL_STARTER)} />,
        connectors: <ConnectorsSection onUpgrade={() => router.push("/plans")} />,
        memory: <MemorySection onTalkWithKarui={() => startChat(router, REMEMBER_STARTER)} />,
        instructions: <InstructionsSection />,
      }}
    />
  );
}
