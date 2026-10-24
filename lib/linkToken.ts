// Fragments keep emailed tokens out of requests, server-rendered payloads and Referer.
export function takeLinkToken(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  window.history.replaceState(null, "", window.location.pathname);
  return token;
}
