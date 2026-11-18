// Sends one connector request the way the user chose: from the browser through the relay frame, or from Karui's
// enclave for MCP servers that don't accept browser calls. Both answer in the same shape.

import { enclaveCall } from "@/lib/enclave/karuiEnclave";
import type { ConnectorRoute } from "./connectors";
import { relayFetch, type RelayRequest, type RelayResponse } from "./mcpSandbox";

type EnclaveReply = { status: number; content_type: string; session_id?: string; www_authenticate?: string; body: string };

function fromEnclave(reply: EnclaveReply): RelayResponse {
  return {
    status: reply.status,
    contentType: reply.content_type,
    sessionId: reply.session_id ?? "",
    wwwAuthenticate: reply.www_authenticate ?? "",
    body: reply.body,
  };
}

// The enclave sends the request sealed from this browser, so our server sees neither the token nor the answer.
export async function connectorFetch(route: ConnectorRoute, request: RelayRequest): Promise<RelayResponse> {
  if (route === "browser") return relayFetch(request);
  return fromEnclave(await enclaveCall<EnclaveReply>("relay", request));
}

// Trades a sign-in code or a refresh token for the tokens of an app Karui registered. The enclave adds the app's client
// secret, so the tokens reach only this browser.
export async function appTokenFetch(app: string, params: Record<string, string>): Promise<RelayResponse> {
  return fromEnclave(await enclaveCall<EnclaveReply>("token", { app, ...params }));
}
