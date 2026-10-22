// Minimal MCP client (Streamable HTTP). Requests go through the connector's route (connectorRelay.ts). Only initialize, tools/list, tools/call and resources/read are implemented.

import type { ConnectorRoute } from "./connectors";
import { connectorFetch } from "./connectorRelay";

const PROTOCOL_VERSION = "2025-06-18";

export type McpServer = {
  url: string;
  route?: ConnectorRoute;
  token?: string;
  // OAuth connectors: a fresh token after a 401, or null when the user has to sign in again.
  refreshToken?: () => Promise<string | null>;
};

export type McpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean };
};

export class McpError extends Error {}

export class SignInRequired extends McpError {
  constructor() {
    super("Sign in to this connector again in Settings, under Connectors.");
  }
}

class SessionExpired extends Error {}

class Unauthorized extends Error {}

type Session = { id: string; protocol: string };

type JsonRpcMessage = {
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
};

const sessions = new Map<string, Promise<Session>>();
let nextId = 1;

function sessionKey(server: McpServer): string {
  return `${server.url}\n${server.token ?? ""}`;
}

function headersFor(server: McpServer, session?: Session): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (server.token) headers.Authorization = `Bearer ${server.token}`;
  if (session) {
    headers["MCP-Protocol-Version"] = session.protocol;
    if (session.id) headers["Mcp-Session-Id"] = session.id;
  }
  return headers;
}

// A reply is plain JSON or an SSE stream; in the stream, wait for the message with our request id.
function findReply(contentType: string, body: string, id: number): JsonRpcMessage | null {
  const matches = (m: unknown): m is JsonRpcMessage => !!m && typeof m === "object" && (m as JsonRpcMessage).id === id;

  if (contentType.includes("text/event-stream")) {
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      try {
        const message: unknown = JSON.parse(data);
        if (matches(message)) return message;
      } catch {
      }
    }
    return null;
  }

  try {
    const message: unknown = JSON.parse(body);
    if (Array.isArray(message)) return message.find(matches) ?? null;
    return matches(message) ? message : null;
  } catch {
    return null;
  }
}

async function rpc(server: McpServer, session: Session | undefined, method: string, params: unknown) {
  const id = nextId++;
  const res = await connectorFetch(server.route ?? "browser", {
    url: server.url,
    headers: headersFor(server, session),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (res.status === 404 && session?.id) throw new SessionExpired();
  if (res.status === 401 || res.status === 403) throw new Unauthorized();
  if (res.status < 200 || res.status >= 300) throw new McpError(`The server answered with an error (${res.status}).`);

  const reply = findReply(res.contentType, res.body, id);
  if (!reply) throw new McpError("That address didn't answer like an MCP server.");
  if (reply.error) throw new McpError(reply.error.message || "The server reported an error.");
  return { result: reply.result, sessionId: res.sessionId };
}

async function openSession(server: McpServer): Promise<Session> {
  const { result, sessionId } = await rpc(server, undefined, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "Karui", version: "1.0.0" },
  });
  const protocol = (result as { protocolVersion?: unknown } | null)?.protocolVersion;
  const session: Session = { id: sessionId, protocol: typeof protocol === "string" ? protocol : PROTOCOL_VERSION };

  await connectorFetch(server.route ?? "browser", {
    url: server.url,
    headers: headersFor(server, session),
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => undefined);
  return session;
}

function getSession(server: McpServer): Promise<Session> {
  const key = sessionKey(server);
  let session = sessions.get(key);
  if (!session) {
    session = openSession(server);
    sessions.set(key, session);
    session.catch(() => sessions.delete(key));
  }
  return session;
}

type Run<T> = (server: McpServer, session: Session) => Promise<T>;

async function inSession<T>(server: McpServer, run: Run<T>): Promise<T> {
  try {
    return await run(server, await getSession(server));
  } catch (error) {
    if (!(error instanceof SessionExpired)) throw error;
    sessions.delete(sessionKey(server));
    return run(server, await getSession(server));
  }
}

// An OAuth token that expired early gets one refresh; a second 401 means the grant itself is gone.
async function withSession<T>(server: McpServer, run: Run<T>): Promise<T> {
  try {
    return await inSession(server, run);
  } catch (error) {
    if (!(error instanceof Unauthorized)) throw error;
    if (!server.refreshToken) throw new McpError(server.token ? "The server didn't accept this token." : "This server needs a token.");
    sessions.delete(sessionKey(server));
    const token = await server.refreshToken();
    if (!token) throw new SignInRequired();
    return withSession({ ...server, token, refreshToken: undefined }, run);
  }
}

export function forgetServer(server: McpServer): void {
  sessions.delete(sessionKey(server));
}

export async function listTools(server: McpServer): Promise<McpTool[]> {
  return withSession(server, async (active, session) => {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const { result } = await rpc(active, session, "tools/list", cursor ? { cursor } : {});
      const r = (result ?? {}) as { tools?: unknown; nextCursor?: unknown };
      if (Array.isArray(r.tools)) {
        for (const t of r.tools) {
          if (t && typeof t === "object" && typeof (t as McpTool).name === "string") tools.push(t as McpTool);
        }
      }
      if (typeof r.nextCursor !== "string" || !r.nextCursor) break;
      cursor = r.nextCursor;
    }
    return tools;
  });
}

export async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>
): Promise<{ text: string; isError: boolean }> {
  return withSession(server, async (active, session) => {
    const { result } = await rpc(active, session, "tools/call", { name, arguments: args });
    const r = (result ?? {}) as {
      content?: Array<{ type?: string; text?: string; resource?: { text?: string; uri?: string } }>;
      structuredContent?: unknown;
      isError?: boolean;
    };
    const parts = (Array.isArray(r.content) ? r.content : []).map((c) => {
      if (c.type === "text") return c.text ?? "";
      if (c.type === "resource") return c.resource?.text ?? c.resource?.uri ?? "";
      return `[${c.type ?? "content"} not shown]`;
    });
    let text = parts.join("\n").trim();
    if (!text && r.structuredContent !== undefined) text = JSON.stringify(r.structuredContent);
    return { text, isError: r.isError === true };
  });
}

export async function readResource(server: McpServer, uri: string): Promise<string> {
  return withSession(server, async (active, session) => {
    const { result } = await rpc(active, session, "resources/read", { uri });
    const r = (result ?? {}) as { contents?: Array<{ text?: string; mimeType?: string }> };
    const parts = (Array.isArray(r.contents) ? r.contents : []).map((c) => c.text ?? `[${c.mimeType ?? "binary"} content not shown]`);
    return parts.join("\n").trim();
  });
}
