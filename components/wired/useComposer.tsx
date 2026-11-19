"use client";

import * as React from "react";
import { PRICING_URL } from "@/app/siteUrl";
import { getModelProvider, getProviderSettings, isModelAvailable, PROVIDERS } from "@/lib/models/providers";
import {
  clampReasoningEffort,
  getReasoningEffort,
  getReasoningLevelsForModel,
  REASONING_EFFORT_LABELS,
  setReasoningEffort,
  type ReasoningEffort,
} from "@/lib/models/reasoning";
import { getMemorySettings } from "@/lib/chat/memory";
import { IMAGES_UNSUPPORTED_NOTE, MAX_IMAGES_PER_MESSAGE, MAX_TEXT_FILES_PER_MESSAGE, modelSupportsImages } from "@/lib/messages/vision";
import { TEXT_FILE_ACCEPT, useFileDrop, useImageAttachments, useTextFileAttachments } from "@/lib/ui/attachments";
import { useToast } from "@/components/Toast";
import type { Composer, ComposerAttachment } from "@/components/app/Composer";
import type { ModelOption } from "@/components/app/ModelPicker";
import type { ComposerSkills, SelectedSkill, SkillCatalog } from "@/components/app/ComposerCommands";
import { getSkillsForChat, SKILLS_UPDATED_EVENT } from "@/lib/chat/skills";
import { getProject } from "@/lib/projects/projects";
import { skillCommandName, type SkillReference } from "@/lib/messages/skillInvocation";
import { readMentions, writeMentions } from "@/lib/messages/mentions";
import { splitQuote } from "@/lib/messages/messageBlocks";
import type { ArtifactReference } from "@/lib/messages/artifactReference";
import { useArtifactMentions } from "./useArtifactMentions";

const MAIN = ["fast", "smart"] as const;
const EXTRA: { id: string; name: string; description: string }[] = [
  { id: "glm-flash", name: "GLM 5.3 Flash", description: "Fast reasoning model on NEAR AI" },
];
const ALL = [...MAIN, ...EXTRA.map((m) => m.id)];

function tierName(id: string, tier: "light" | "heavy") {
  const provider = getModelProvider(id);
  const model = provider ? PROVIDERS[provider].models.find((m) => m.tier === tier) : null;
  return model?.name ?? (tier === "light" ? "Light" : "Heavy");
}

function efforts(id: string) {
  return getReasoningLevelsForModel(id).map((l) => ({ value: l, label: REASONING_EFFORT_LABELS[l] }));
}

function unavailable(id: string) {
  return isModelAvailable(id) ? undefined : "Not available right now";
}

export function buildModelOptions(): ModelOption[] {
  return [
    { id: "fast", name: tierName("fast", "light"), tier: "light", description: "Solid default for everyday conversations", efforts: efforts("fast") },
    { id: "smart", name: tierName("smart", "heavy"), tier: "heavy", description: "More depth when the answer is hard", efforts: efforts("smart"), pro: true },
    ...EXTRA.map((m) => ({ ...m, tier: "more" as const, more: true, pro: true, description: unavailable(m.id) ?? m.description, efforts: efforts(m.id) })),
  ];
}

export function useComposer({ onSubmit, fixedModel, skillsEnabled = false, artifactsEnabled = skillsEnabled, projectId }: { onSubmit: () => void; fixedModel?: boolean; skillsEnabled?: boolean; artifactsEnabled?: boolean; projectId?: string | null }) {
  const { showError } = useToast();
  const artifactMentions = useArtifactMentions(artifactsEnabled);
  const setArtifacts = artifactMentions.setSelected;
  const [text, setTextValue] = React.useState("");
  const scope = skillsEnabled ? projectId ?? "" : null;
  const [skillState, setSkillState] = React.useState<{ scope: string | null; catalog: SkillCatalog; selected: SelectedSkill | null }>({ scope: null, catalog: { status: "loading" }, selected: null });
  const [skillVersion, setSkillVersion] = React.useState(0);
  const reloadSkills = React.useCallback(() => setSkillVersion((version) => version + 1), []);
  const activeSkills = skillState.scope === scope ? skillState : null;
  const skillStateRef = React.useRef(activeSkills);
  skillStateRef.current = activeSkills;
  const selectedSkill = activeSkills?.selected ?? null;
  const setText = React.useCallback((value: string) => {
    setTextValue(value);
    setSkillState((state) => ({ ...state, selected: null }));
    setArtifacts([]);
  }, [setArtifacts]);
  const restore = React.useCallback((content: string, reference?: SkillReference, artifacts: ArtifactReference[] = []) => {
    const catalog = skillStateRef.current?.catalog;
    const skill = reference && catalog?.status === "ready" ? catalog.items.find((item) => item.id === reference.id && item.source === reference.source) : undefined;
    // Offsets count the typed text, which follows the quote.
    const base = content.length - splitQuote(content).text.length;
    const read = readMentions(content, [
      { at: skill && reference?.at !== undefined ? base + reference.at : -1, label: skill ? skillCommandName(skill.name) : "" },
      ...artifacts.map(({ at, title }) => ({ at: at === undefined ? -1 : base + at, label: `@${title}` })),
    ]);
    const [skillAt, ...artifactAts] = read.offsets;
    setTextValue(read.text);
    setSkillState((state) => ({ ...state, selected: skill && skillAt !== null ? { skill, at: skillAt } : null }));
    setArtifacts(artifacts.flatMap(({ chatId, path, title, type }, i) => {
      const at = artifactAts[i];
      return at === null ? [] : [{ artifact: { chatId, path, title, type }, at }];
    }));
  }, [setArtifacts]);

  React.useEffect(() => {
    if (scope === null) return;
    let cancelled = false;
    setSkillState((state) => ({ scope, catalog: { status: "loading" }, selected: state.scope === scope ? state.selected : null }));
    void (async () => {
      try {
        const allowed = projectId ? (await getProject(projectId)).settings.skillIds : undefined;
        const items = await getSkillsForChat(allowed, "required");
        if (!cancelled) setSkillState((state) => ({ ...state, scope, catalog: { status: "ready", items } }));
      } catch {
        if (!cancelled) setSkillState((state) => ({ ...state, scope, catalog: { status: "error", onRetry: reloadSkills } }));
      }
    })();
    return () => { cancelled = true; };
  }, [scope, projectId, skillVersion, reloadSkills]);

  React.useEffect(() => {
    if (!skillsEnabled) return;
    window.addEventListener(SKILLS_UPDATED_EVENT, reloadSkills);
    window.addEventListener("karui-reload-projects", reloadSkills);
    return () => {
      window.removeEventListener(SKILLS_UPDATED_EVENT, reloadSkills);
      window.removeEventListener("karui-reload-projects", reloadSkills);
    };
  }, [skillsEnabled, reloadSkills]);
  const [model, setModel] = React.useState<string>(MAIN[0]);
  const pickModel = React.useCallback((id: string) => {
    if (ALL.includes(id)) setModel(id);
  }, []);
  const [effort, setEffort] = React.useState<ReasoningEffort | null>(null);
  const [webSearch, setWebSearch] = React.useState(false);
  const [memoryAvailable, setMemoryAvailable] = React.useState(false);
  const [options, setOptions] = React.useState<ModelOption[]>([]);

  const imgs = useImageAttachments(showError, true);
  const docs = useTextFileAttachments(showError);
  const addAny = React.useCallback(
    (list: FileList | File[]) => {
      imgs.addFiles(list);
      docs.addFiles(list);
    },
    [imgs, docs],
  );
  const drop = useFileDrop(addAny);

  React.useEffect(() => {
    setEffort(getReasoningEffort());
    setWebSearch(getProviderSettings().autoWebSearch);
    setMemoryAvailable(getMemorySettings().enabled);
    setOptions(buildModelOptions());
  }, []);

  const attachments: ComposerAttachment[] = [
    ...imgs.images.map((img, i) => ({ id: `img-${i}`, kind: "image" as const, name: img.name, src: img.data })),
    ...docs.files.map((f, i) => ({
      id: `file-${i}`,
      kind: "file" as const,
      name: f.name,
      content: f.content,
      meta: `${Math.max(1, Math.round(f.content.length / 1024))} KB`,
    })),
  ];

  const busy = imgs.isProcessing || docs.isProcessing;
  const activeModel = model;
  const imagesOn = modelSupportsImages(activeModel);
  const activeEffort = clampReasoningEffort(activeModel, effort);

  const props: React.ComponentProps<typeof Composer> = {
    value: text,
    onChange: setText,
    onSubmit: () => {
      if (busy) return;
      if (imgs.images.length > 0 && !imagesOn) {
        showError(IMAGES_UNSUPPORTED_NOTE);
        return;
      }
      onSubmit();
    },
    skills: scope === null ? undefined : {
      catalog: activeSkills?.catalog ?? { status: "loading" },
      selected: selectedSkill,
      onSelect: (selected) => setSkillState((state) => ({ ...state, selected })),
      error: selectedSkill && activeSkills?.catalog.status === "ready" && !activeSkills.catalog.items.some((item) => item.id === selectedSkill.skill.id && item.source === selectedSkill.skill.source)
        ? "This skill is no longer available in this chat. Remove it or choose another."
        : undefined,
    } satisfies ComposerSkills,
    artifacts: artifactMentions.props,
    attachments,
    accept: imagesOn ? `image/*,${TEXT_FILE_ACCEPT}` : TEXT_FILE_ACCEPT,
    fileAccept: TEXT_FILE_ACCEPT,
    imagesEnabled: imagesOn,
    attachNote: imagesOn
      ? `Up to ${MAX_IMAGES_PER_MESSAGE} images and ${MAX_TEXT_FILES_PER_MESSAGE} text files per message`
      : `Up to ${MAX_TEXT_FILES_PER_MESSAGE} text files per message. This model can't read images.`,
    onAttach: addAny,
    onRemoveAttachment: (id) => {
      const [kind, index] = id.split("-");
      if (kind === "img") imgs.removeImage(Number(index));
      else docs.removeFile(Number(index));
    },
    onPaste: (e) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        addAny(files);
      }
    },
    webSearch: { on: webSearch, onToggle: () => setWebSearch((w) => !w) },
    model: {
      options,
      value: activeModel,
      onChange: setModel,
      effort: activeEffort,
      onEffortChange: (e) => {
        setEffort(e as ReasoningEffort);
        setReasoningEffort(e as ReasoningEffort);
      },
      moreLocked: false,
      onUpgrade: () => window.location.assign(PRICING_URL),
      fixed: fixedModel,
    },
  };

  const selectedArtifacts = artifactMentions.selected;
  const written = writeMentions(text, [
    ...(selectedSkill ? [{ at: selectedSkill.at, label: skillCommandName(selectedSkill.skill.name) }] : []),
    ...selectedArtifacts.map(({ artifact, at }) => ({ at, label: `@${artifact.title}` })),
  ]);
  const artifactOffsets = written.offsets.slice(selectedSkill ? 1 : 0);

  return {
    props,
    text,
    message: written.text,
    skill: selectedSkill ? { id: selectedSkill.skill.id, source: selectedSkill.skill.source, at: written.offsets[0] } : undefined,
    artifacts: selectedArtifacts.length
      ? selectedArtifacts.map(({ artifact: { chatId, path, title, type } }, i) => ({ chatId, path, title, type, at: artifactOffsets[i] }))
      : undefined,
    setText,
    restore,
    model: activeModel,
    setModel: pickModel,
    webSearch,
    setWebSearch,
    memoryAvailable,
    syncMemoryAvailable: () => setMemoryAvailable(getMemorySettings().enabled),
    images: imgs.images,
    files: docs.files,
    busy,
    isEmpty: !text.trim() && !selectedSkill && !selectedArtifacts.length && imgs.images.length === 0 && docs.files.length === 0,
    reset: () => {
      setText("");
      imgs.clearImages();
      docs.clearFiles();
    },
    drop,
  };
}
