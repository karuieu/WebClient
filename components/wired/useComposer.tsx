"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

export function useComposer({ onSubmit, fixedModel }: { onSubmit: () => void; fixedModel?: boolean }) {
  const router = useRouter();
  const { showError } = useToast();
  const [text, setText] = React.useState("");
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
      onUpgrade: () => router.push("/plans"),
      fixed: fixedModel,
    },
  };

  return {
    props,
    text,
    setText,
    model: activeModel,
    setModel: pickModel,
    webSearch,
    setWebSearch,
    memoryAvailable,
    images: imgs.images,
    files: docs.files,
    busy,
    isEmpty: !text.trim() && imgs.images.length === 0 && docs.files.length === 0,
    reset: () => {
      setText("");
      imgs.clearImages();
      docs.clearFiles();
    },
    drop,
  };
}
