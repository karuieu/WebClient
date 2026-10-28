import type { Nodes, PhrasingContent } from "mdast";

// Two consecutive numbers after the first, so "1. Call 2. times" stays one item.
const MIN_ITEMS = 3;

const findMarker = (text: string, number: number) => new RegExp(`\\s${number}\\.\\s+`).exec(text);

function pushText(item: PhrasingContent[], value: string): void {
  if (value) item.push({ type: "text", value });
}

function splitRunOn(children: PhrasingContent[], start: number): PhrasingContent[][] {
  const items: PhrasingContent[][] = [[]];
  let next = start + 1;
  for (const node of children) {
    if (node.type !== "text") {
      items[items.length - 1].push(node);
      continue;
    }
    let rest = node.value;
    for (let marker = findMarker(rest, next); marker; marker = findMarker(rest, next)) {
      pushText(items[items.length - 1], rest.slice(0, marker.index));
      items.push([]);
      rest = rest.slice(marker.index + marker[0].length);
      next++;
    }
    pushText(items[items.length - 1], rest);
  }
  return items;
}

function transform(node: Nodes): void {
  if (!("children" in node)) return;
  node.children.forEach(transform);
  if (node.type !== "list" || !node.ordered || node.children.length !== 1) return;
  const [paragraph] = node.children[0].children;
  if (node.children[0].children.length !== 1 || paragraph.type !== "paragraph") return;
  const items = splitRunOn(paragraph.children, node.start ?? 1);
  if (items.length < MIN_ITEMS) return;
  node.children = items.map((children) => ({ type: "listItem", spread: false, children: [{ type: "paragraph", children }] }));
}

/**
 * Small models sometimes write a numbered list on one line ("1. A 2. B 3. C"), which Markdown reads as
 * a single item; this splits it back into the list the model meant.
 */
export function remarkRunOnList() {
  return transform;
}
