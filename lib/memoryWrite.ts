// Helper phases persist memory edits and proposals as UI blocks. Strip them from model history so the model does not repeat memory-save notices.

export interface MemoryWriteBlock {
  action: "edit" | "proposal";
  file_id: string | null;
  category: string | null;
  file: string | null;
  text: string;
}

const BLOCK_PATTERN = /<memory_write>([\s\S]*?)<\/memory_write>/g;

export function encodeMemoryWriteBlock(block: MemoryWriteBlock): string {
  // Escape literal < characters so text cannot terminate the memory_write block; JSON.parse restores them.
  const json = JSON.stringify(block).replace(/</g, "\\u003c");
  return `<memory_write>${json}</memory_write>`;
}

export function parseMemoryWriteBlock(inner: string): MemoryWriteBlock | null {
  let raw: unknown;
  try {
    raw = JSON.parse(inner);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.action !== "edit" && r.action !== "proposal") return null;
  if (typeof r.text !== "string" || !r.text.trim()) return null;
  const optional = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    action: r.action,
    file_id: optional(r.file_id),
    category: optional(r.category),
    file: optional(r.file),
    text: r.text,
  };
}

export function stripMemoryWriteBlocks(content: string): string {
  return content.replace(BLOCK_PATTERN, "");
}

/** Keep transcript labels aligned with MEMORY_ORGANIZE_PROMPT so proposals cannot be confused with user speech. */
export function annotateMemoryWrites(content: string): string {
  return content.replace(BLOCK_PATTERN, (_, inner: string) => {
    const block = parseMemoryWriteBlock(inner);
    if (!block) return "";
    const where = block.file ? ` (file: ${block.category ?? "?"} / ${block.file})` : "";
    const label =
      block.action === "edit"
        ? MEMORY_WRITE_LABEL_EDIT
        : MEMORY_WRITE_LABEL_PROPOSAL;
    return `\n${label}${where}: ${block.text}\n`;
  });
}

export const MEMORY_WRITE_LABEL_PROPOSAL = "[Memory suggestion made during this conversation]";
export const MEMORY_WRITE_LABEL_EDIT = "[Memory already updated during this conversation]";
