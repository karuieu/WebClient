import type { InferenceClient } from "@nearai/inference-sdk";
import { isSignedIn, onSessionCleared } from "@/lib/account/session";
import { API_URL, assertProxiedAPIURL } from "@/lib/core/api";
import { CALL_DRAIN_LIMIT_MS, createLoopGuard, REPETITION_NOTICE, type StopAt } from "@/lib/messages/repetition";
import { StoppedError, UnverifiedAnswerError } from "@/lib/core/errors";
import { STOPPED_NOTICE } from "@/lib/messages/messageBlocks";
import { parseToolResponse, withToolInstructions, type JsonTool, type ToolResponse } from "./jsonTools";

export interface NearAITurn {
  role: string;
  content: unknown;
}

type CreateParams = Parameters<InferenceClient["chat"]["completions"]["create"]>[0];

let client: Promise<InferenceClient> | null = null;
let verified = false;

// Per session: the next account on the tab must not reuse this one's client.
onSessionCleared(() => {
  client = null;
  verified = false;
});

export function isNearAIVerified(): boolean {
  return verified && isSignedIn();
}

// Gecko (Firefox, LibreWolf) has no Request.body, and the NEAR SDK reads every chat request through it before
// encrypting, so each call failed before reaching the network. Remove once nearai/inference-sdk reads it another way.
export function polyfillRequestBody(): void {
  if (typeof Request === "undefined" || "body" in Request.prototype) return;
  Object.defineProperty(Request.prototype, "body", {
    configurable: true,
    get(this: Request): ReadableStream<Uint8Array> | null {
      if (this.method === "GET" || this.method === "HEAD") return null;
      const copy = this.clone();
      return new ReadableStream({
        async start(controller) {
          controller.enqueue(new Uint8Array(await copy.arrayBuffer()));
          controller.close();
        },
      });
    },
  });
}

function getClient(): Promise<InferenceClient> {
  if (!client) {
    polyfillRequestBody();
    const ready = (async () => {
      // A large bundle, so it loads only when someone uses NEAR AI.
      const [sdk, { createGpuEvidenceVerifier }] = await Promise.all([
        import("@nearai/inference-sdk"),
        import("./nvidiaGpuVerifier"),
      ]);
      // Intel's and NVIDIA's services through our relays: the CSP lets the page
      // reach only our API.
      const tdxQuote = sdk.createTdxQuoteVerifier({ pccsUrl: `${API_URL}/api/pccs` });
      // Ours, not the SDK's: the SDK allows no clock skew on NVIDIA's token.
      const gpuEvidence = createGpuEvidenceVerifier({
        nrasUrl: `${API_URL}/api/nras/attest/gpu`,
        jwksUrl: `${API_URL}/api/nras/jwks.json`,
      });
      return new sdk.InferenceClient({
        baseUrl: `${API_URL}/api/nearai/v1`,
        // No Authorization: the session cookie goes with every request to our API (lib/core/api.ts), and the proxy adds
        // our NEAR key.
        headers: {},
        e2ee: true,
        gatewayVerification: { verifiers: { tdxQuote } },
        modelVerification: { verifiers: { tdxQuote, gpuEvidence } },
      });
    })();
    client = ready;
    ready.catch(() => {
      if (client === ready) client = null;
    });
  }
  return client;
}

async function verifiedClient(providerModelID: string): Promise<InferenceClient> {
  if (!isSignedIn()) throw new Error("No active session — please sign in again.");
  // Over plain http anyone on the way could swap the reports and the key.
  assertProxiedAPIURL("NEAR AI's attestation");

  const c = await getClient();
  try {
    await c.verify(providerModelID);
  } catch (error) {
    console.warn("[karui] NEAR AI attestation:", error);
    throw new Error("NEAR AI's attestation didn't verify in your browser, so nothing was sent.");
  }
  verified = true;
  return c;
}

// The SDK keeps the verification for an hour and shares an in-flight one with the next send.
export function prewarmNearAI(providerModelID: string): void {
  verifiedClient(providerModelID).catch(() => {});
}

// The SDK decrypts with whatever key the answer names, and our public key travels in the clear. Only the model's
// signature over the exact request and response bytes shows the answer came from the attested model.
async function verifyCompletion(c: InferenceClient, completionId: string | undefined): Promise<void> {
  try {
    if (!completionId) throw new Error("no completion id");
    const { signatureKind } = await c.verifyResponse(completionId);
    if (signatureKind !== "provider_tee") throw new Error(`signed by the ${signatureKind}, not the model`);
  } catch (error) {
    console.warn("[karui] NEAR AI signature:", error);
    throw new UnverifiedAnswerError();
  }
}

export interface NearAIStreamResult {
  text: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  // False when the user stopped the answer before its signature could be checked.
  verified: boolean;
}

interface StreamChunk {
  id?: string;
  choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function streamNearAIChat(
  opts: {
    providerModelID: string;
    turns: NearAITurn[];
    reasoningParams?: Record<string, unknown>;
    signal?: AbortSignal;
    stopAt?: StopAt;
  },
  onToken: (token: string) => void
): Promise<NearAIStreamResult> {
  const c = await verifiedClient(opts.providerModelID);

  let stream: AsyncIterable<StreamChunk>;
  try {
    const request = {
      model: opts.providerModelID,
      messages: opts.turns,
      stream: true,
      // Usage in every chunk lets our proxy bill a stopped answer for what was generated, not the whole hold.
      stream_options: { include_usage: true, continuous_usage_stats: true },
      ...(opts.reasoningParams ?? {}),
    };
    stream = (await c.chat.completions.create(request as unknown as CreateParams, { signal: opts.signal })) as unknown as AsyncIterable<StreamChunk>;
  } catch (error) {
    if (opts.signal?.aborted) throw new StoppedError();
    throw error;
  }

  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let inReasoning = false;
  let loopStopped = false;
  let completionId: string | undefined;
  let drainUntil: number | null = null;
  let drainTimedOut = false;
  const loopCut = createLoopGuard();

  try {
    for await (const chunk of stream) {
      completionId ??= chunk.id;
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }
      // Past a tool call or repetition cut, the rest is read only for the signature; nothing more is shown.
      if (drainUntil !== null) {
        if (Date.now() > drainUntil) {
          drainTimedOut = true;
          break;
        }
        continue;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Thinking is wrapped in <reasoning> (the format MessageBubble parses). Some models send 'reasoning', others 'reasoning_content'.
      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (reasoning) {
        if (!inReasoning) {
          inReasoning = true;
          text += "<reasoning>";
          onToken("<reasoning>");
        }
        text += reasoning;
        onToken(reasoning);
      }

      if (delta.content) {
        if (inReasoning) {
          inReasoning = false;
          text += "</reasoning>";
          onToken("</reasoning>");
        }
        text += delta.content;
        onToken(delta.content);
      }

      // Only a complete answer has a signature; CALL_DRAIN_LIMIT_MS bounds the cost of reading past a loop.
      const cut = loopCut(text);
      if (cut !== -1) {
        text = text.slice(0, cut);
        loopStopped = true;
        drainUntil = Date.now() + CALL_DRAIN_LIMIT_MS;
        continue;
      }
      const call = opts.stopAt?.(text) ?? -1;
      if (call !== -1) {
        text = text.slice(0, call);
        drainUntil = Date.now() + CALL_DRAIN_LIMIT_MS;
      }
    }
  } catch (error) {
    if (!opts.signal?.aborted) throw error;
  }
  // The OpenAI SDK under NEAR's ends the stream quietly on abort instead of throwing, so Stop is read from the signal.
  const stopped = opts.signal?.aborted === true;
  if (drainTimedOut) throw new UnverifiedAnswerError();
  const verified = !stopped;
  if (verified) await verifyCompletion(c, completionId);

  if (inReasoning) {
    text += "</reasoning>";
    onToken("</reasoning>");
  }
  if (loopStopped) {
    text += REPETITION_NOTICE;
    onToken(REPETITION_NOTICE);
  }
  if (stopped) {
    if (!text.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim()) throw new StoppedError();
    text += STOPPED_NOTICE;
    onToken(STOPPED_NOTICE);
  }

  return { text, provider: "nearai", inputTokens, outputTokens, verified };
}

// One non-streaming call, optionally with tools. Tool definitions and calls are encrypted like messages.
export async function nearAICompletion(opts: {
  providerModelID: string;
  turns: NearAITurn[];
  tools?: JsonTool[];
  reasoningParams?: Record<string, unknown>;
  /** A phase declaration for our proxy — it decides which pool this call bills to. */
  phase?: "compression";
  /** Tells our proxy not to discount the base prompt this call doesn't carry. */
  withoutBasePrompt?: boolean;
}): Promise<ToolResponse> {
  const c = await verifiedClient(opts.providerModelID);
  const tools = opts.tools ?? [];

  const request = {
    model: opts.providerModelID,
    messages: tools.length > 0 ? withToolInstructions(opts.turns, tools) : opts.turns,
    ...(opts.reasoningParams ?? {}),
    ...(tools.length > 0 ? { response_format: { type: "json_object" } } : {}),
  };
  const headers = {
    ...(opts.phase ? { "X-Karui-Phase": opts.phase } : {}),
    ...(opts.withoutBasePrompt ? { "X-Karui-Base-Prompt": "none" } : {}),
  };
  const response = (await c.chat.completions.create(
    request as unknown as CreateParams,
    Object.keys(headers).length > 0 ? { headers } : undefined
  )) as unknown as { id?: string; choices?: Array<{ message?: { content?: string | null } }> };
  await verifyCompletion(c, response.id);

  const content = response.choices?.[0]?.message?.content ?? "";
  if (tools.length === 0) return { content, toolCalls: [] };
  return parseToolResponse(content, tools);
}
