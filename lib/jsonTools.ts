// Tools go in the encrypted prompt as plain JSON: Phala's E2EE v2 leaves native tools in the clear, and NEAR's models often answered the message instead of calling them.

export interface JsonTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface Turn {
  role: string;
  content: unknown;
}

export interface ToolResponse {
  content: string;
  toolCalls: Array<{ name: string; arguments: string }>;
  message?: string;
  followUp?: boolean;
}

export function withToolInstructions<T extends Turn>(turns: T[], tools: JsonTool[], allowMessage = false, allowFollowUp = false): Turn[] {
  const instructions =
    `\n\n# Tools\nYou can call these tools:\n${JSON.stringify(tools)}\n\n` +
    `Reply with ONLY a JSON object, no prose and no code fence: ` +
    `{"tool_calls":[{"name":"<tool name>","arguments":{...}}]}. ` +
    `Reply {"tool_calls":[]} when no call is needed.` +
    (allowMessage
      ? ` You may also include "message": a brief sentence to the user in their language, before the actions you chose. ` +
        `It is optional, not reasoning or a final answer. Don't claim an action already succeeded. ` +
        `Omit it when no action is needed or when calling hand_off.`
      : "") +
    (allowFollowUp
      ? ` Include "follow_up": true only when you need to read the selected context before choosing more actions, ` +
        `for example a search query that depends on a memory file. Otherwise omit it.`
      : "");
  const first = turns[0];
  if (first?.role === "system" && typeof first.content === "string") {
    return [{ role: "system", content: first.content + instructions }, ...turns.slice(1)];
  }
  return [{ role: "system", content: instructions.trim() }, ...turns];
}

export function parseToolResponse(content: string, tools: JsonTool[], allowMessage = false, allowFollowUp = false): ToolResponse {
  const empty = { content: "", toolCalls: [] };
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
  const { tool_calls: calls, message, follow_up: followUp } = parsed as { tool_calls?: unknown; message?: unknown; follow_up?: unknown };
  if (!Array.isArray(calls)) return empty;
  const known = new Set(tools.map((t) => t.name));
  const toolCalls = calls.flatMap((call: unknown) => {
    const { name, arguments: args } = (call ?? {}) as { name?: unknown; arguments?: unknown };
    if (typeof name !== "string" || !known.has(name)) return [];
    return [{ name, arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}) }];
  });
  return {
    content: "",
    toolCalls,
    ...(allowMessage && typeof message === "string" && message.trim() && toolCalls.length > 0 && !toolCalls.some((c) => c.name === "hand_off")
      ? { message: message.trim() }
      : {}),
    ...(allowFollowUp && followUp === true ? { followUp: true } : {}),
  };
}

export function parseToolCalls(content: string, tools: JsonTool[]): ToolResponse["toolCalls"] {
  return parseToolResponse(content, tools).toolCalls;
}
