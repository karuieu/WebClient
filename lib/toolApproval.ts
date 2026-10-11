import { accountSettingKey } from "./session";

export type ToolApprovalRequest = {
  connector: string;
  tool: string;
  description?: string;
  args: Record<string, unknown>;
};

type Handler = (request: ToolApprovalRequest) => Promise<boolean>;

let handler: Handler | null = null;

export function setToolApprovalHandler(next: Handler | null): void {
  handler = next;
}

/** Nobody listening (no approval UI mounted) counts as a no. */
export function requestToolApproval(request: ToolApprovalRequest): Promise<boolean> {
  return handler ? handler(request) : Promise.resolve(false);
}

// When connector tools wait for approval. 'untrusted' (default) asks for data-changing tools always, and for read-only ones once untrusted content is in the context: a read-only fetch with a URL can still send data out.
export type ToolApprovalMode = "untrusted" | "always";

const MODE_KEY = "karui_tool_approval";

export function getToolApprovalMode(): ToolApprovalMode {
  try {
    return window.localStorage.getItem(accountSettingKey(MODE_KEY)) === "always" ? "always" : "untrusted";
  } catch {
    return "untrusted";
  }
}

export function setToolApprovalMode(mode: ToolApprovalMode): void {
  try {
    window.localStorage.setItem(accountSettingKey(MODE_KEY), mode);
  } catch {
  }
}
