import { API_URL, apiFetch } from "@/lib/core/api";
import { toHex } from "./hex";

// sha256 of each reviewed app_compose of Phala's gateway, with the gateway commit replaced by {commit}. The commit
// changes with every release and is checked against the public repo's main instead; any other change (an image, the
// launch script, routing config) gives a new hash, and Phala stays off until that compose is reviewed and listed.
const REVIEWED_GATEWAY_COMPOSES = new Set(["2237e9e598391e316bccb4c28d7506b6150f282a25d3b535ce4287a8d6a95d5e"]);

const COMMIT_VALUE = /PRIVATE_AI_GATEWAY_REPO_COMMIT=([0-9a-f]{40})/g;

const UNREVIEWED = "Phala's gateway is running a release Karui hasn't reviewed yet, so nothing was sent.";

// Only commits found on main are remembered; main isn't rewritten, so the answer holds.
const commitsOnMain = new Set<string>();

async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

// GitHub also serves fork commits under the parent repo's URL, so the commit must be on main, not merely fetchable.
// The app's CSP keeps the browser off GitHub, so our API asks.
async function isOnMain(commit: string): Promise<boolean> {
  if (commitsOnMain.has(commit)) return true;
  const response = await apiFetch(`${API_URL}/api/phala-gateway/commits/${commit}`);
  if (!response.ok) throw new Error("Couldn't check Phala's gateway release. Try again in a moment.");
  const onMain = ((await response.json()) as { on_main?: unknown }).on_main === true;
  if (onMain) commitsOnMain.add(commit);
  return onMain;
}

// Takes the app_compose whose measurement the attestation already verified.
export async function assertReviewedGateway(appCompose: string | undefined): Promise<void> {
  const commits = [...(appCompose ?? "").matchAll(COMMIT_VALUE)];
  if (!appCompose || commits.length !== 1) throw new Error(UNREVIEWED);
  const template = appCompose.replace(COMMIT_VALUE, "PRIVATE_AI_GATEWAY_REPO_COMMIT={commit}");
  if (!REVIEWED_GATEWAY_COMPOSES.has(await sha256Hex(template))) throw new Error(UNREVIEWED);
  if (!(await isOnMain(commits[0][1]))) throw new Error(UNREVIEWED);
}
