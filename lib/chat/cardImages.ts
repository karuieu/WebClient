import { API_URL, apiFetch } from "@/lib/core/api";

/**
 * A card's image as a blob: URL. The server fetches it, because the app's CSP allows no image host and a direct
 * load would show the user's address and the page to that host. The caller revokes the URL when done.
 */
export async function fetchCardImage(address: string): Promise<string> {
  const response = await apiFetch(`${API_URL}/api/ai/fetch/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: address }),
  });
  if (!response.ok) throw new Error(`The card image didn't load (HTTP ${response.status}).`);
  return URL.createObjectURL(await response.blob());
}
