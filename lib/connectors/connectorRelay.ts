// Sends one connector request the way the user chose: from the browser through the relay frame, or from Karui's
// enclave for MCP servers that don't accept browser calls. Both answer in the same shape.

import { apiJSON } from "@/lib/core/api";
import { enclaveCall } from "@/lib/enclave/karuiEnclave";
import { ENCLAVE_IN_USE } from "@/lib/enclave/karuiEnclaveTrust";
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
  return fromServer(await karuiRelay(request));
}

// The enclave sends the request sealed from this browser, so our server sees neither the token nor the answer. The
// route through our server stays only until the app accepts an enclave build (karuiEnclaveTrust.ts).
function karuiRelay(request: RelayRequest): Promise<ServerReply> {
  if (ENCLAVE_IN_USE) return enclaveCall<ServerReply>("relay", request);
  return apiJSON<ServerReply>("/api/connectors/relay", { method: "POST", body: JSON.stringify(request) });
}

// Trades a sign-in code or a refresh token for the tokens of an app Karui registered. The app's client secret is
// added where the exchange is made: in the enclave, or on our server until the app accepts an enclave build.
export async function appTokenFetch(app: string, params: Record<string, string>): Promise<RelayResponse> {
  const request = { app, ...params };
  if (ENCLAVE_IN_USE) return fromServer(await enclaveCall<ServerReply>("token", request));
  return fromServer(await apiJSON<ServerReply>("/api/connectors/token", { method: "POST", body: JSON.stringify(request) }));
}
