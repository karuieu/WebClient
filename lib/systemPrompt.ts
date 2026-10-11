import { API_URL, apiFetch } from "./api";
import { onSessionCleared } from "./session";

let cached: string | null = null;

// The prompt depends on the token, so the next account in the same tab must fetch its own.
onSessionCleared(() => {
  cached = null;
});

export async function fetchSystemPrompt(): Promise<string> {
  if (cached !== null) return cached;
  const response = await apiFetch(`${API_URL}/api/ai/system-prompt`);
  if (!response.ok) throw new Error("Could not fetch the system prompt");
  const data = (await response.json()) as { prompt: string };
  cached = data.prompt;
  return cached;
}

export function lacksBasePrompt(messages: ReadonlyArray<{ role: string; content: unknown }>): boolean {
  if (!cached) return false;
  const first = messages[0];
  return !(first?.role === "system" && typeof first.content === "string" && first.content.startsWith(cached));
}
