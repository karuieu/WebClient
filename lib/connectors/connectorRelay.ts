// Sends one connector request the way the user chose: from the browser through the relay frame, or from Karui's
// server for MCP servers that don't accept browser calls. Both answer in the same shape.

import { apiJSON } from "@/lib/core/api";
import type { ConnectorRoute } from "./connectors";
import { relayFetch, type RelayRequest, type RelayResponse } from "./mcpSandbox";

export type ServerReply = { status: number; content_type: string; session_id?: string; www_authenticate?: string; body: string };

export function fromServer(reply: ServerReply): RelayResponse {
  return {
    status: reply.status,
    contentType: reply.content_type,
    sessionId: reply.session_id ?? "",
    wwwAuthenticate: reply.www_authenticate ?? "",
    body: reply.body,
  };
}

export async function connectorFetch(route: ConnectorRoute, request: RelayRequest): Promise<RelayResponse> {
  if (route === "browser") return relayFetch(request);
  return fromServer(await apiJSON<ServerReply>("/api/connectors/relay", { method: "POST", body: JSON.stringify(request) }));
}
