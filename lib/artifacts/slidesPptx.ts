/**
 * PowerPoint from the deck as the browser lays it out. Each text block becomes a text box where it sits, with its
 * colours, size and font, so the slides stay editable; boxes with a fill or border become shapes. It all runs in the
 * browser: the deck is rendered in a hidden frame without scripts, and nothing is sent anywhere.
 */

import { SLIDE_WIDTH, downloadBlob, fileName, slidesDocument, slidesHeight, slideCount } from "./artifacts";
import { waitForSlideLayout } from "./slideLayout";

export type Box = { x: number; y: number; w: number; h: number };
export type Run = { text: string; bold: boolean; italic: boolean; color: string };
export type Paragraph = { runs: Run[]; bullet?: "bullet" | "number"; indentLevel?: number };
export type TextStyle = { fontFace: string; fontSize: number; align: "left" | "center" | "right"; lineSpacingMultiple: number };
export type Fill = { color: string; transparency: number };
export type SlideItem =
  | { kind: "shape"; box: Box; fill: Fill | null; line: { color: string; width: number } | null; radius: number }
  | { kind: "image"; box: Box; data: string }
  | { kind: "text"; box: Box; paragraphs: Paragraph[]; style: TextStyle };
export type SlideSpec = { background: string; items: SlideItem[]; notes: string };

const PX_PER_INCH = 96;
const PT_PER_PX = 0.75;
// PowerPoint sets type a little wider than the browser; the slack keeps a line from wrapping one word early.
const WRAP_SLACK_PX = 8;
const DEFAULT_BACKGROUND = "FFFFFF";
const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "BLOCKQUOTE", "FIGCAPTION", "PRE"]);
const LIST_TAGS = new Set(["UL", "OL"]);
const SKIPPED_TAGS = new Set(["STYLE", "SCRIPT", "TEMPLATE"]);
const GENERIC_FONTS: Record<string, string> = { serif: "Georgia", monospace: "Courier New", "ui-monospace": "Courier New" };
const SANS_FALLBACK = "Arial";

type Context = { view: Window; origin: DOMRect; items: SlideItem[] };

/** "rgb(…)" and "rgba(…)" read directly; anything else (oklch, color(…)) goes through a 1×1 canvas when there is one. */
export function cssColor(value: string): Fill | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/.exec(value);
  if (!m) return canvasColor(value);
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  if (alpha === 0) return null;
  return { color: hex([m[1], m[2], m[3]].map(Number)), transparency: Math.round((1 - alpha) * 100) };
}

function hex(rgb: number[]): string {
  return rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function canvasColor(value: string): Fill | null {
  if (!value || value === "transparent" || value === "none") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 0 ? null : { color: hex([r, g, b]), transparency: Math.round((1 - a / 255) * 100) };
}

/** A gradient has no single colour; its first stop stands in for it. */
function fillOf(style: CSSStyleDeclaration): Fill | null {
  const firstStop = /rgba?\([^)]*\)/.exec(style.backgroundImage)?.[0];
  return cssColor(style.backgroundColor) ?? (firstStop ? cssColor(firstStop) : null);
}

function inches(px: number): number {
  return Math.round((px / PX_PER_INCH) * 1000) / 1000;
}

function boxOf(el: Element, origin: DOMRect, inset = { top: 0, right: 0, bottom: 0, left: 0 }): Box {
  const r = el.getBoundingClientRect();
  return {
    x: inches(r.left - origin.left + inset.left),
    y: inches(r.top - origin.top + inset.top),
    w: inches(r.width - inset.left - inset.right),
    h: inches(r.height - inset.top - inset.bottom),
  };
}

// Text sits inside padding and border, so the text box is the content box.
function contentInset(style: CSSStyleDeclaration): { top: number; right: number; bottom: number; left: number } {
  const side = (s: "Top" | "Right" | "Bottom" | "Left") => (parseFloat(style[`padding${s}`]) || 0) + (parseFloat(style[`border${s}Width`]) || 0);
  return { top: side("Top"), right: side("Right"), bottom: side("Bottom"), left: side("Left") };
}

function fontFaceOf(family: string): string {
  const first = family.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (first in GENERIC_FONTS) return GENERIC_FONTS[first];
  return !first || first === "sans-serif" || first === "system-ui" || first.startsWith("-") ? SANS_FALLBACK : first;
}

function alignOf(textAlign: string): TextStyle["align"] {
  if (textAlign === "center") return "center";
  return textAlign === "right" || textAlign === "end" ? "right" : "left";
}

function textStyleOf(style: CSSStyleDeclaration): TextStyle {
  const size = parseFloat(style.fontSize) || 16;
  const line = parseFloat(style.lineHeight);
  return {
    fontFace: fontFaceOf(style.fontFamily),
    fontSize: Math.round(size * PT_PER_PX * 10) / 10,
    align: alignOf(style.textAlign),
    lineSpacingMultiple: Number.isFinite(line) ? Math.round((line / size) * 100) / 100 : 1.2,
  };
}

function runOf(text: string, parent: Element, view: Window): Run {
  const style = view.getComputedStyle(parent);
  const shown = style.textTransform === "uppercase" ? text.toUpperCase() : style.textTransform === "lowercase" ? text.toLowerCase() : text;
  return {
    text: style.whiteSpace.startsWith("pre") ? shown : shown.replace(/\s+/g, " "),
    bold: Number(style.fontWeight) >= 600 || style.fontWeight === "bold",
    italic: style.fontStyle === "italic",
    color: cssColor(style.color)?.color ?? "000000",
  };
}

// Spaces at a paragraph's edges come from the source's line breaks, not from the text.
function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  if (out.length) out[0].text = out[0].text.trimStart();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  return out.filter((r) => r.text);
}

function isSkipped(el: Element, view: Window): boolean {
  if (SKIPPED_TAGS.has(el.tagName)) return true;
  const style = view.getComputedStyle(el);
  return style.display === "none" || style.visibility === "hidden";
}

function isInline(el: Element, view: Window): boolean {
  return view.getComputedStyle(el).display.startsWith("inline") || el.tagName === "BR";
}

/** Inline text becomes runs; a block inside the block, or a line break, starts a new paragraph. */
function paragraphsOf(block: Element, view: Window, skip: (el: Element) => boolean = () => false): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let runs: Run[] = [];
  const flush = () => {
    const trimmed = trimRuns(runs);
    if (trimmed.length) paragraphs.push({ runs: trimmed });
    runs = [];
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && child.parentElement) runs.push(runOf(child.textContent ?? "", child.parentElement, view));
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      if (isSkipped(el, view) || skip(el)) continue;
      if (el.tagName === "BR") flush();
      else if (isInline(el, view)) walk(el);
      else {
        flush();
        walk(el);
        flush();
      }
    }
  };
  walk(block);
  flush();
  return paragraphs;
}

// PowerPoint counts list levels from 0, the top level.
function listParagraphs(list: Element, view: Window, level = 0): Paragraph[] {
  const bullet = list.tagName === "OL" ? "number" : "bullet";
  return Array.from(list.children).flatMap((item) => {
    if (item.tagName !== "LI") return [];
    const own = paragraphsOf(item, view, (el) => LIST_TAGS.has(el.tagName)).map((p) => ({ ...p, bullet, indentLevel: level }) as Paragraph);
    const nested = Array.from(item.children).filter((el) => LIST_TAGS.has(el.tagName)).flatMap((el) => listParagraphs(el, view, level + 1));
    return [...own, ...nested];
  });
}

function hasOwnText(el: Element): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
}

function shapeOf(el: Element, style: CSSStyleDeclaration, ctx: Context): SlideItem | null {
  const fill = fillOf(style);
  const width = parseFloat(style.borderTopWidth) || 0;
  const border = width > 0 && style.borderTopStyle !== "none" ? cssColor(style.borderTopColor) : null;
  if (!fill && !border) return null;
  const rect = el.getBoundingClientRect();
  const radius = Math.min((parseFloat(style.borderTopLeftRadius) || 0) / (Math.min(rect.width, rect.height) / 2 || 1), 1);
  return { kind: "shape", box: boxOf(el, ctx.origin), fill, line: border && { color: border.color, width: width * PT_PER_PX }, radius };
}

function svgData(svg: Element): string {
  const xml = new XMLSerializer().serializeToString(svg);
  const bytes = new TextEncoder().encode(xml);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `image/svg+xml;base64,${btoa(binary)}`;
}

function imageOf(el: Element, ctx: Context): SlideItem | null {
  if (el.tagName.toLowerCase() === "svg") return { kind: "image", box: boxOf(el, ctx.origin), data: svgData(el) };
  const src = el.getAttribute("src") ?? "";
  // The deck's CSP loads nothing else, so only an embedded picture can be in it.
  return src.startsWith("data:image/") ? { kind: "image", box: boxOf(el, ctx.origin), data: src.slice("data:".length) } : null;
}

function textItem(el: Element, style: CSSStyleDeclaration, paragraphs: Paragraph[], ctx: Context): SlideItem | null {
  if (!paragraphs.length) return null;
  const box = boxOf(el, ctx.origin, contentInset(style));
  return { kind: "text", box: { ...box, w: box.w + inches(WRAP_SLACK_PX) }, paragraphs, style: textStyleOf(style) };
}

function collectItems(parent: Element, ctx: Context): void {
  for (const el of Array.from(parent.children)) {
    if (isSkipped(el, ctx.view)) continue;
    const style = ctx.view.getComputedStyle(el);
    const shape = shapeOf(el, style, ctx);
    if (shape) ctx.items.push(shape);
    const tag = el.tagName.toUpperCase();
    if (tag === "IMG" || tag === "SVG") {
      const image = imageOf(el, ctx);
      if (image) ctx.items.push(image);
    } else if (LIST_TAGS.has(tag)) {
      const text = textItem(el, style, listParagraphs(el, ctx.view), ctx);
      if (text) ctx.items.push(text);
    } else if (TEXT_TAGS.has(tag) || hasOwnText(el)) {
      const text = textItem(el, style, paragraphsOf(el, ctx.view), ctx);
      if (text) ctx.items.push(text);
    } else {
      collectItems(el, ctx);
    }
  }
}

/** What each rendered slide holds, in inches from its top-left corner, in paint order. */
export function readSlides(doc: Document): SlideSpec[] {
  const view = doc.defaultView;
  if (!view) return [];
  return Array.from(doc.querySelectorAll("body > section")).map((section) => {
    const ctx: Context = { view, origin: section.getBoundingClientRect(), items: [] };
    collectItems(section, ctx);
    return {
      background: fillOf(view.getComputedStyle(section))?.color ?? DEFAULT_BACKGROUND,
      items: ctx.items,
      notes: (section.querySelector("aside.notes")?.textContent ?? "").trim(),
    };
  });
}

type Pptx = InstanceType<typeof import("pptxgenjs").default>;
type PptxSlide = ReturnType<Pptx["addSlide"]>;

function textRuns(paragraphs: Paragraph[]) {
  return paragraphs.flatMap((p, pi) =>
    p.runs.map((run, ri) => ({
      text: run.text,
      options: {
        bold: run.bold,
        italic: run.italic,
        color: run.color,
        bullet: p.bullet ? (p.bullet === "number" ? { type: "number" as const } : true) : false,
        indentLevel: p.indentLevel,
        breakLine: ri === p.runs.length - 1 && pi < paragraphs.length - 1,
      },
    })),
  );
}

function addItem(pptx: Pptx, slide: PptxSlide, item: SlideItem): void {
  if (item.kind === "image") {
    slide.addImage({ data: item.data, ...item.box, sizing: { type: "contain", w: item.box.w, h: item.box.h } });
  } else if (item.kind === "shape") {
    slide.addShape(item.radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
      ...item.box,
      fill: item.fill ? { color: item.fill.color, transparency: item.fill.transparency } : { type: "none" },
      line: item.line ? { color: item.line.color, width: item.line.width } : { type: "none" },
      rectRadius: item.radius || undefined,
    });
  } else {
    slide.addText(textRuns(item.paragraphs), { ...item.box, ...item.style, valign: "top", margin: 0, fit: "none", wrap: true });
  }
}

/** The .pptx file: one 16:9 slide per section, the size the deck was laid out at. */
export async function buildPptx(slides: SlideSpec[], title: string): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  for (const spec of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: spec.background };
    for (const item of spec.items) addItem(pptx, slide, item);
    if (spec.notes) slide.addNotes(spec.notes);
  }
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

/** Same-origin so this page can read the layout; scripts stay off, as everywhere a deck is shown. */
async function renderedDeck<T>(source: string, read: (doc: Document) => T): Promise<T> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    `position:fixed;left:-${SLIDE_WIDTH * 2}px;top:0;border:0;visibility:hidden;` +
    `width:${SLIDE_WIDTH}px;height:${slidesHeight(slideCount(source))}px`;
  const loaded = new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
  frame.srcdoc = slidesDocument(source);
  document.body.appendChild(frame);
  try {
    await loaded;
    const doc = frame.contentDocument;
    if (!doc) throw new Error("The slides could not be laid out");
    await waitForSlideLayout(doc);
    return read(doc);
  } finally {
    frame.remove();
  }
}

export async function downloadArtifactPptx(artifact: { title: string; content: string }): Promise<void> {
  const slides = await renderedDeck(artifact.content, readSlides);
  downloadBlob(await buildPptx(slides, artifact.title), fileName(artifact.title, "pptx"));
}
