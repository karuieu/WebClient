import type { ArtifactType } from "@/lib/artifacts/artifacts";

export type ArtifactReference = { chatId: string; path: string; title: string; type: ArtifactType };

export function parseArtifactReferences(value: unknown): ArtifactReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const references: ArtifactReference[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { chatId, path, title, type } = item as Record<string, unknown>;
    if (typeof chatId !== "string" || !chatId || typeof path !== "string" || !path || typeof title !== "string") continue;
    if (type !== "markdown" && type !== "html" && type !== "code" && type !== "slides") continue;
    references.push({ chatId, path, title, type });
  }
  return references.length ? references : undefined;
}

export function artifactMentionText(references?: ArtifactReference[]): string {
  return references?.map(({ title }) => `@${title}`).join(", ") ?? "";
}
