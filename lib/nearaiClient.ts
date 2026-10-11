import type { InferenceClient } from "@nearai/inference-sdk";
import { isSignedIn, onSessionCleared } from "./session";
import { API_URL, assertProxiedAPIURL } from "./api";
import { createLoopGuard, REPETITION_NOTICE } from "./repetition";
import { StoppedError } from "./errors";
import { STOPPED_NOTICE } from "./messageBlocks";
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
        // No Authorization: the session cookie goes with every request to our API (lib/api.ts), and the proxy adds
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

export interface NearAIStreamResult {
  text: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function streamNearAIChat(
  opts: {
    providerModelID: string;
    turns: NearAITurn[];
    reasoningParams?: Record<string, unknown>;
    signal?: AbortSignal;
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
  let stopped = false;
  const loopCut = createLoopGuard();

  try {
    for await (const chunk of stream) {
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
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

      // Breaking out of the iterator aborts the request, so a looping model
      // stops burning tokens.
      const cut = loopCut(text);
      if (cut !== -1) {
        text = text.slice(0, cut);
        loopStopped = true;
        break;
      }
    }
  } catch (error) {
    if (!opts.signal?.aborted) throw error;
    stopped = true;
  }

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

  return { text, provider: "nearai", inputTokens, outputTokens };
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
  maxTokens?: number;
  allowMessage?: boolean;
  allowFollowUp?: boolean;
}): Promise<ToolResponse> {
  const c = await verifiedClient(opts.providerModelID);
  const tools = opts.tools ?? [];

  const request = {
    model: opts.providerModelID,
    messages: tools.length > 0 ? withToolInstructions(opts.turns, tools, opts.allowMessage, opts.allowFollowUp) : opts.turns,
    ...(opts.reasoningParams ?? {}),
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(tools.length > 0 ? { response_format: { type: "json_object" } } : {}),
  };
  const headers = {
    ...(opts.phase ? { "X-Karui-Phase": opts.phase } : {}),
    ...(opts.withoutBasePrompt ? { "X-Karui-Base-Prompt": "none" } : {}),
  };
  const response = (await c.chat.completions.create(
    request as unknown as CreateParams,
    Object.keys(headers).length > 0 ? { headers } : undefined
  )) as unknown as { choices?: Array<{ message?: { content?: string | null } }> };

  const content = response.choices?.[0]?.message?.content ?? "";
  if (tools.length === 0) return { content, toolCalls: [] };
  return parseToolResponse(content, tools, opts.allowMessage, opts.allowFollowUp);
}
