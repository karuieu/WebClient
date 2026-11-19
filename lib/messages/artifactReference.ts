import type { ArtifactType } from "@/lib/artifacts/artifacts";

// `at` is where "@title" starts in the message text.
export type ArtifactReference = { chatId: string; path: string; title: string; type: ArtifactType; at?: number };

export function parseArtifactReferences(value: unknown): ArtifactReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const references: ArtifactReference[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { chatId, path, title, type, at } = item as Record<string, unknown>;
    if (typeof chatId !== "string" || !chatId || typeof path !== "string" || !path || typeof title !== "string") continue;
    if (type !== "markdown" && type !== "html" && type !== "code" && type !== "slides") continue;
    references.push({ chatId, path, title, type, ...(Number.isInteger(at) && Number(at) >= 0 ? { at: Number(at) } : {}) });
  }
  return references.length ? references : undefined;
}
