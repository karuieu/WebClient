// A visitor sent to sign in on the way to buying Pro comes back to the purchase step.
// The value is fixed, never a path from the URL, so the query can't redirect anywhere else.
const UPGRADE_INTENT = "upgrade";

export const LOGIN_FOR_UPGRADE_PATH = `/login?next=${UPGRADE_INTENT}`;

export function afterLoginPath(search: string): string {
  return new URLSearchParams(search).get("next") === UPGRADE_INTENT ? "/upgrade" : "/new";
}
