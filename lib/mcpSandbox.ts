// App side of the connector relay. Connector traffic goes through a hidden frame on a separate origin, so the app's strict CSP still blocks an injected script from sending decrypted chats out.

const RELAY_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_MCP_SANDBOX_ORIGIN ||
    (process.env.NODE_ENV === "production" ? "https://mcp.karui.eu" : "http://127.0.0.1:3000")
).origin;

const LOAD_TIMEOUT_MS = 15000;

export type RelayResponse = { status: number; contentType: string; sessionId: string; body: string };

type RelayReply = (RelayResponse & { id: string }) | { id: string; error: string };

const pending = new Map<string, (reply: RelayReply) => void>();
let portPromise: Promise<MessagePort> | null = null;

function openRelay(): Promise<MessagePort> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.src = `${RELAY_ORIGIN}/mcp-sandbox.html`;

    const fail = () => {
      frame.remove();
      reject(new Error("Karui couldn't start its connector relay. Reload the page and try again."));
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);

    frame.addEventListener("load", () => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent) => {
        if ((event.data as { type?: string } | null)?.type !== "ready") return;
        clearTimeout(timer);
        channel.port1.onmessage = (e: MessageEvent<RelayReply>) => {
          const resolveReply = pending.get(e.data?.id);
          if (!resolveReply) return;
          pending.delete(e.data.id);
          resolveReply(e.data);
        };
        resolve(channel.port1);
      };
      frame.contentWindow?.postMessage({ type: "karui-mcp-connect" }, RELAY_ORIGIN, [channel.port2]);
    });

    document.body.appendChild(frame);
  });
}

function relayPort(): Promise<MessagePort> {
  if (!portPromise) {
    portPromise = openRelay();
    portPromise.catch(() => {
      portPromise = null;
    });
  }
  return portPromise;
}

export async function relayFetch(request: {
  url: string;
  method?: "POST" | "DELETE";
  headers: Record<string, string>;
  body?: string;
}): Promise<RelayResponse> {
  const port = await relayPort();
  const id = crypto.randomUUID();
  const reply = await new Promise<RelayReply>((resolve) => {
    pending.set(id, resolve);
    port.postMessage({ id, ...request });
  });
  if ("error" in reply) throw new Error(reply.error);
  return reply;
}
