import type { GoogleConnector } from "@/lib/connectors";
import { connectorFetch } from "@/lib/connectorRelay";
import { McpError, SignInRequired, type McpServer, type McpTool } from "@/lib/mcpClient";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const DRIVE = "https://www.googleapis.com/drive/v3";
export const GOOGLE_DOCS_URL = "https://docs.googleapis.com/v1/documents";
const MAX_TEXT_CHARS = 24_000;

export class GoogleApiError extends McpError {
  constructor(readonly status: number) {
    super(status === 403 ? "Google didn't allow this action. Check the connector's permissions and API configuration."
      : status === 429 ? "Google is receiving too many requests. Try again shortly."
        : status === 404 ? "Google couldn't find that item, or this connection can't access it."
          : `Google couldn't complete this action (${status}).`);
  }
}

export async function googleRequest(server: McpServer, url: string, body?: unknown): Promise<unknown> {
  const target = new URL(url);
  if (!["https://gmail.googleapis.com", "https://www.googleapis.com", "https://docs.googleapis.com"].includes(target.origin) || target.username || target.password) {
    throw new McpError("This isn't a supported Google API address.");
  }
  const send = (token: string | undefined) => connectorFetch(server.route ?? "browser", {
    url, method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token ?? ""}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let reply = await send(server.token);
  if (reply.status === 401 && server.refreshToken) {
    const token = await server.refreshToken();
    if (!token) throw new SignInRequired();
    reply = await send(token);
  }
  if (reply.status === 401) throw new SignInRequired();
  if (reply.status < 200 || reply.status >= 300) throw new GoogleApiError(reply.status);
  if (!reply.contentType.includes("json")) return reply.body.slice(0, MAX_TEXT_CHARS);
  try { return JSON.parse(reply.body) as unknown; }
  catch { throw new McpError("Google returned an unreadable response. Try again."); }
}

function tool(name: string, description: string, schema: { properties: Record<string, unknown>; required?: string[]; readOnly?: boolean }): McpTool {
  return { name, description, inputSchema: { type: "object", properties: schema.properties, required: schema.required ?? [], additionalProperties: false }, annotations: { readOnlyHint: schema.readOnly !== false } };
}

const string = { type: "string" };
const paging = { page_token: string };
const TOOLS: Record<GoogleConnector, McpTool[]> = {
  gmail: [
    tool("search_messages", "Find Gmail messages with Gmail search syntax. Returns message IDs; use read_message for content. Up to 20 results per page.", { properties: { query: string, ...paging } }),
    tool("read_message", "Read a Gmail message, including its headers, text and attachment names. Attachments are not downloaded.", { properties: { message_id: string }, required: ["message_id"] }),
    tool("read_thread", "Read messages in a Gmail thread.", { properties: { thread_id: string }, required: ["thread_id"] }),
    tool("create_draft", "Create a plain-text Gmail draft addressed to one email address. Does not send it.", { properties: { to: string, subject: string, body: string }, required: ["to", "subject", "body"], readOnly: false }),
  ],
  drive: [
    tool("search_files", "Find Google Drive files by name. Returns IDs, types and links, up to 20 results per page.", { properties: { name: string, ...paging } }),
    tool("read_file", "Read a text file or export a Google Doc as text. Does not read spreadsheets, presentations, PDFs or binary files.", { properties: { file_id: string }, required: ["file_id"] }),
  ],
  docs: [tool("read_document", "Read a Google Doc created by Karui. Save and update artifacts using the document panel, not this tool.", { properties: { document_id: string }, required: ["document_id"] })],
};

export function googleTools(api: GoogleConnector): McpTool[] {
  return TOOLS[api];
}

function textArg(args: Record<string, unknown>, key: string, optional = false): string {
  const value = args[key];
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > 100_000) throw new McpError(`Provide a valid ${key}.`);
  return value;
}

export function googleId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(value)) throw new McpError("That Google item ID isn't valid.");
  return value;
}

function searchUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

type MailPart = { mimeType?: string; filename?: string; body?: { data?: string }; parts?: MailPart[] };
type MailMessage = { id?: string; threadId?: string; snippet?: string; payload?: MailPart & { headers?: { name: string; value: string }[] } };

function decodeBody(part: MailPart): string {
  if (!part.body?.data) return "";
  try {
    const bytes = Uint8Array.from(atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes).slice(0, MAX_TEXT_CHARS);
  } catch { return ""; }
}

function mailText(part: MailPart): string {
  if (part.filename) return "";
  if (part.mimeType === "text/plain") return decodeBody(part);
  const children = part.parts ?? [];
  const plain = children.find((p) => p.mimeType === "text/plain" && !p.filename);
  if (plain) return mailText(plain);
  if (children.length) return children.map(mailText).filter(Boolean).join("\n").slice(0, MAX_TEXT_CHARS);
  if (part.mimeType !== "text/html") return "";
  const template = document.createElement("template");
  template.innerHTML = decodeBody(part);
  template.content.querySelectorAll("script,style,iframe,object").forEach((node) => node.remove());
  return template.content.textContent ?? "";
}

function attachments(part: MailPart): string[] {
  return [part.filename ?? "", ...(part.parts ?? []).flatMap(attachments)].filter(Boolean);
}

function messageText(value: unknown): unknown {
  const message = value as MailMessage | null;
  if (!message?.payload) throw new McpError("Google returned an unreadable message.");
  return { id: message.id, threadId: message.threadId,
    headers: message.payload.headers?.filter((h) => ["from", "to", "cc", "subject", "date"].includes(h.name.toLowerCase())),
    text: mailText(message.payload) || message.snippet || "", attachments: attachments(message.payload) };
}

function rawDraft(args: Record<string, unknown>): string {
  const to = textArg(args, "to");
  const subject = textArg(args, "subject");
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to) || to.includes("\0") || /[\r\n\0]/.test(subject)) throw new McpError("Use one email address and a single-line subject.");
  if (subject.length > 998) throw new McpError("Use a shorter email subject.");
  const encode = (value: string) => btoa(Array.from(new TextEncoder().encode(value), (b) => String.fromCharCode(b)).join(""));
  const body = textArg(args, "body").replace(/\r?\n/g, "\r\n");
  const header = subject.match(/.{1,10}/gu)?.map((part) => `=?UTF-8?B?${encode(part)}?=`).join("\r\n ") ?? "";
  const mime = `To: ${to}\r\nSubject: ${header}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encode(body).match(/.{1,76}/g)?.join("\r\n") ?? ""}`;
  return encode(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function callGmail(server: McpServer, name: string, args: Record<string, unknown>): Promise<unknown> {
  const id = (key: string) => googleId(textArg(args, key));
  if (name === "search_messages") return googleRequest(server, searchUrl(`${GMAIL}/messages`, { q: textArg(args, "query", true), maxResults: "20", pageToken: textArg(args, "page_token", true) }));
  if (name === "read_message") return messageText(await googleRequest(server, `${GMAIL}/messages/${id("message_id")}?format=full`));
  if (name === "read_thread") {
    const thread = await googleRequest(server, `${GMAIL}/threads/${id("thread_id")}?format=full`) as { messages?: unknown[] };
    return { messages: thread.messages?.map(messageText) ?? [] };
  }
  return googleRequest(server, `${GMAIL}/drafts`, { message: { raw: rawDraft(args) } });
}

async function readFile(server: McpServer, id: string): Promise<unknown> {
  const file = await googleRequest(server, `${DRIVE}/files/${id}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`) as { mimeType?: string };
  if (file.mimeType === "application/vnd.google-apps.document") return { file, text: await googleRequest(server, `${DRIVE}/files/${id}/export?mimeType=text%2Fplain`) };
  if (!file.mimeType?.startsWith("text/")) throw new McpError("This connector reads text files and Google Docs, not spreadsheets, presentations or binary files.");
  return { file, text: await googleRequest(server, `${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`) };
}

export async function callGoogleTool(server: McpServer, api: GoogleConnector, request: { name: string; args: Record<string, unknown> }): Promise<{ text: string; isError: boolean }> {
  const { name, args } = request;
  if (!TOOLS[api].some((t) => t.name === name)) throw new McpError("That tool isn't available for this Google connector.");
  let result: unknown;
  if (api === "gmail") result = await callGmail(server, name, args);
  else if (name === "search_files") {
    const query = textArg(args, "name", true).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    result = await googleRequest(server, searchUrl(`${DRIVE}/files`, { q: `trashed = false${query ? ` and name contains '${query}'` : ""}`, fields: "files(id,name,mimeType,webViewLink),nextPageToken", pageSize: "20", pageToken: textArg(args, "page_token", true) }));
  } else result = await readFile(server, googleId(textArg(args, api === "docs" ? "document_id" : "file_id")));
  return { text: JSON.stringify(result), isError: false };
}
