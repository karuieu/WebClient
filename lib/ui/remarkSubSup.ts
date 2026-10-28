import type { Nodes, PhrasingContent, RootContent } from "mdast";

const TAGS = ["sub", "sup"] as const;

function isHtml(node: RootContent, value: string): boolean {
  return node.type === "html" && node.value.trim().toLowerCase() === value;
}

function wrapPairs(children: RootContent[]): RootContent[] {
  const result: RootContent[] = [];
  for (let i = 0; i < children.length; i++) {
    const tag = TAGS.find((t) => isHtml(children[i], `<${t}>`));
    const end = tag ? children.findIndex((node, j) => j > i && isHtml(node, `</${tag}>`)) : -1;
    if (!tag || end === -1) {
      result.push(children[i]);
      continue;
    }
    result.push({ type: "emphasis", data: { hName: tag }, children: children.slice(i + 1, end) as PhrasingContent[] });
    i = end;
  }
  return result;
}

function transform(node: Nodes): void {
  if (!("children" in node)) return;
  node.children.forEach(transform);
  node.children = wrapPairs(node.children) as typeof node.children;
}

/**
 * Raw HTML stays escaped in answers; only matched <sub>/<sup> pairs become real tags, so a model
 * writing N<sub>A</sub> renders a subscript without opening the renderer to arbitrary HTML.
 */
export function remarkSubSup() {
  return transform;
}
