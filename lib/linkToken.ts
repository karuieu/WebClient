// Fragments keep emailed tokens out of requests and Referer; query tokens support older links.
// Replace the current history entry so neither format stays in the address bar.
export function takeLinkToken(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  window.history.replaceState(null, "", window.location.pathname);
  return fromHash || fromQuery || null;
}
