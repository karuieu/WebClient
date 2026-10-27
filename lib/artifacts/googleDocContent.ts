import { toDocument, type Artifact } from "@/lib/artifacts/artifacts";

type DocRequest = Record<string, unknown>;
export type GoogleDocContent = { text: string; formatting: DocRequest[] };

const BLOCKS = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "PRE", "UL", "OL", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6"]);
const SKIP = new Set(["HEAD", "TITLE", "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "IMG", "SVG", "VIDEO", "AUDIO", "CANVAS", "TEMPLATE", "NOSCRIPT"]);
const MAX_CONTENT_CHARS = 150_000;
const MAX_FORMATTING_REQUESTS = 1_000;

// Template contents stay inert: document images and other remote resources never load during conversion.
export function googleDocContent(artifact: Pick<Artifact, "type" | "title" | "content">): GoogleDocContent {
  const template = document.createElement("template");
  template.innerHTML = toDocument(artifact);
  let text = "";
  const formatting: DocRequest[] = [];
  const newline = () => { if (text && !text.endsWith("\n")) text += "\n"; };

  const visit = (node: Node, pre = false): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += pre ? node.textContent ?? "" : (node.textContent ?? "").replace(/\s+/g, " ");
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName;
    if (SKIP.has(tag) || node.hasAttribute("hidden")) return;
    if (tag === "BR") { text += "\n"; return; }
    if (BLOCKS.has(tag)) newline();
    const startIndex = text.length + 1;
    if (tag === "LI") text += "• ";
    node.childNodes.forEach((child) => visit(child, pre || tag === "PRE"));
    const endIndex = text.length + 1;
    const range = { startIndex, endIndex };
    if (endIndex > startIndex) {
      if (/^H[1-6]$/.test(tag)) formatting.push({ updateParagraphStyle: { range, paragraphStyle: { namedStyleType: `HEADING_${tag.slice(1)}` }, fields: "namedStyleType" } });
      if (["B", "STRONG"].includes(tag)) formatting.push({ updateTextStyle: { range, textStyle: { bold: true }, fields: "bold" } });
      if (["I", "EM"].includes(tag)) formatting.push({ updateTextStyle: { range, textStyle: { italic: true }, fields: "italic" } });
      if (tag === "CODE" || tag === "PRE") formatting.push({ updateTextStyle: { range, textStyle: { weightedFontFamily: { fontFamily: "Courier New" } }, fields: "weightedFontFamily" } });
    }
    if (tag === "TD" || tag === "TH") text += "\t";
    if (BLOCKS.has(tag)) newline();
  };
  template.content.childNodes.forEach((node) => visit(node));
  if (!text.trim()) throw new Error("This artifact has no text to save to Google Docs.");
  if (text.length > MAX_CONTENT_CHARS || formatting.length > MAX_FORMATTING_REQUESTS) throw new Error("This artifact is too large to export to Google Docs. Save a smaller document.");
  return { text, formatting };
}

export function googleDocRequests(content: GoogleDocContent, endIndex: number): DocRequest[] {
  const range = { startIndex: 1, endIndex: content.text.length + 1 };
  return [
    ...(endIndex > 2 ? [{ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } }] : []),
    { insertText: { location: { index: 1 }, text: content.text } },
    { updateParagraphStyle: { range, paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, fields: "namedStyleType" } },
    { updateTextStyle: { range, textStyle: { bold: false, italic: false, weightedFontFamily: { fontFamily: "Arial" } }, fields: "bold,italic,weightedFontFamily" } },
    ...content.formatting,
  ];
}
