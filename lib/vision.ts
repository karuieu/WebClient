// Images and text attachments in chat. Images are encrypted with the message (a JSON envelope in encrypted_content); models that cannot read images are never sent them.

export interface ChatImage {

  name: string;

  mime: string;
  data: string;
  description?: string;
}

export const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_DATAURL_CHARS = 6_000_000;

const MAX_IMAGE_DIMENSION = 2048;

export interface ChatTextFile {

  name: string;

  content: string;
}

export const MAX_TEXT_FILES_PER_MESSAGE = 5;
const MAX_TEXT_FILE_CHARS = 200_000;

const TEXT_FILE_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".yaml", ".yml",
  ".xml", ".html", ".htm", ".css", ".js", ".jsx", ".ts", ".tsx", ".py",
  ".go", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".cs", ".rb", ".php",
  ".sh", ".sql", ".ini", ".toml", ".env", ".log",
]);

export function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") return true;
  const dot = file.name.lastIndexOf(".");
  if (dot === -1) return file.type === "";
  return TEXT_FILE_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export async function fileToChatTextFile(file: File): Promise<ChatTextFile> {
  if (!isTextFile(file)) {
    throw new Error(`"${file.name}" is not a supported text file type.`);
  }
  const content = await readAsText(file);
  if (content.length > MAX_TEXT_FILE_CHARS) {
    throw new Error(`"${file.name}" is too large to attach (max ${MAX_TEXT_FILE_CHARS.toLocaleString()} characters).`);
  }
  return { name: file.name, content };
}

// Models with image input. Keep in sync with the live catalogues. GLM 5.3 (Heavy) at Phala is text only.

const IMAGE_MODELS = new Set<string>(["fast", "qwen3-8-27b"]);

export function modelSupportsImages(modelId: string): boolean {
  return IMAGE_MODELS.has(modelId);
}

export const IMAGES_UNSUPPORTED_NOTE = "Heavy can't read images. Switch to Light or Qwen 3.8 27B to send one.";

// Plain messages remain strings for compatibility; attachments use a karui_att JSON envelope before encryption.

const ATTACHMENT_MARK = '{"karui_att":1';

export function packMessageContent(text: string, images: ChatImage[], files: ChatTextFile[] = []): string {
  if (images.length === 0 && files.length === 0) return text;
  return JSON.stringify({ karui_att: 1, text, images, files });
}

export interface ParsedMessageContent {
  text: string;
  images: ChatImage[];
  files: ChatTextFile[];
}

export function parseMessageContent(content: string): ParsedMessageContent {
  if (!content.startsWith(ATTACHMENT_MARK)) return { text: content, images: [], files: [] };
  try {
    const parsed = JSON.parse(content) as {
      karui_att?: number;
      text?: string;
      images?: ChatImage[];
      files?: ChatTextFile[];
    };
    if (parsed.karui_att !== 1) return { text: content, images: [], files: [] };
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      images: Array.isArray(parsed.images) ? parsed.images.filter((i) => i && typeof i.data === "string") : [],
      files: Array.isArray(parsed.files) ? parsed.files.filter((f) => f && typeof f.content === "string") : [],
    };
  } catch {
    return { text: content, images: [], files: [] };
  }
}

export function turnContentForAI(
  content: string,
  readsImages: boolean
): { content: string; images?: string[] } {
  const { text, images, files } = parseMessageContent(content);

  let out = text;
  for (const file of files) {
    out += `\n\n<attached_file name="${file.name || "file"}">\n${file.content}\n</attached_file>`;
  }

  if (images.length === 0) return { content: out.trim() };

  if (readsImages) {
    return { content: out.trim(), images: images.map((i) => i.data) };
  }

  for (const img of images) {
    const desc = img.description?.trim()
      ? img.description.trim()
      : "(image omitted — this model can't read images)";
    out += `\n\n<attached_image name="${img.name || "image"}">\n${desc}\n</attached_image>`;
  }
  return { content: out.trim() };
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function drawScaled(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");
  // Paint a white background because JPEG cannot preserve alpha transparency.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function fileToChatImage(file: File): Promise<ChatImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }

  const original = await readAsDataURL(file);
  const img = await loadImage(original);

  const smallEnough =
    Math.max(img.width, img.height) <= MAX_IMAGE_DIMENSION &&
    original.length <= 1_500_000;
  if (smallEnough) {
    return { name: file.name, mime: file.type, data: original };
  }

  let data = drawScaled(img, MAX_IMAGE_DIMENSION, 0.85);
  if (data.length > MAX_IMAGE_DATAURL_CHARS) {
    data = drawScaled(img, 1280, 0.75);
  }
  if (data.length > MAX_IMAGE_DATAURL_CHARS) {
    throw new Error("Image is too large to attach.");
  }
  return { name: file.name, mime: "image/jpeg", data };
}
