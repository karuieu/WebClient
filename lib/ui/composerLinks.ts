import type { ComposerCodeBlock } from "@/lib/ui/composerCode";
import { webLinks, type WebLink } from "@/lib/ui/webLinks";

export function composerLinks(text: string, blocks: ComposerCodeBlock[], tokenAt?: number): WebLink[] {
  const links: WebLink[] = [];
  let blockIndex = 0;
  for (const link of webLinks(text)) {
    while (blocks[blockIndex]?.end <= link.start) blockIndex++;
    if (blocks[blockIndex]?.start < link.end || (tokenAt !== undefined && tokenAt > link.start && tokenAt < link.end)) continue;
    links.push(link);
  }
  return links;
}
