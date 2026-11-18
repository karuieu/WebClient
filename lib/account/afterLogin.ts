// A visitor sent to sign in on the way to buying a plan comes back to the purchase step.
// The values are fixed, never a path from the URL, so the query can't redirect anywhere else.
const UPGRADE_INTENT = "upgrade";
const MAX_INTENT = "upgrade-max";

export const LOGIN_FOR_UPGRADE_PATH = `/login?next=${UPGRADE_INTENT}`;
export const LOGIN_FOR_MAX_PATH = `/login?next=${MAX_INTENT}`;
export const MAX_UPGRADE_PATH = "/upgrade?plan=max";

export function asksForMax(params: URLSearchParams): boolean {
  return params.get("plan") === "max";
}

export function afterLoginPath(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (next === MAX_INTENT) return MAX_UPGRADE_PATH;
  return next === UPGRADE_INTENT ? "/upgrade" : "/new";
}
