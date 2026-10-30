import type { AttestationBundle, AttestationDocument } from "@tinfoilsh/verifier";
import { API_URL, apiFetch } from "@/lib/core/api";
import { toHex } from "./hex";

// Phala's gateway forwards Light, Heavy and the Gemma helper to Tinfoil's router. The browser checks that router
// itself: AMD's report, measured against a Sigstore-signed release of this repo. The pieces come through /api/tinfoil
// under the app's CSP; they are signed, so the relay can withhold them but not forge them.
const CONFIG_REPO = "tinfoilsh/confidential-model-router";
const SNP_FORMAT = "https://tinfoil.sh/predicate/sev-snp-guest/v2";
const RELAY = `${API_URL}/api/tinfoil`;
const VERIFIED_FOR_SECONDS = 3600;

let verified: { fingerprint: string; staleAfter: number } | null = null;
let pending: Promise<string> | null = null;

async function relay(path: string): Promise<Response> {
  const response = await apiFetch(`${RELAY}${path}`);
  if (!response.ok) throw new Error(`Tinfoil's attestation answered ${response.status}`);
  return response;
}

async function gunzip(base64: string): Promise<Uint8Array> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Only what names the VCEK to fetch; the verifier checks the report itself, so a wrong guess just fails.
export function vcekPath(report: Uint8Array): string {
  const view = new DataView(report.buffer, report.byteOffset, report.byteLength);
  const version = view.getUint32(0, true);
  const family = view.getUint8(0x188);
  const model = view.getUint8(0x189);
  const product =
    version === 2 || (family === 0x19 && model === 0x11) ? "Genoa"
    : family === 0x19 && model === 0x01 ? "Milan"
    : family === 0x1a && model === 0x02 ? "Turin"
    : null;
  if (!product) throw new Error("Tinfoil runs on a processor Karui doesn't know");
  const tcb = view.getBigUint64(0x180, true);
  const spl = (shift: bigint) => Number((tcb >> shift) & 0xffn);
  const chip = toHex(report.slice(0x1a0, 0x1e0));
  return `/vcek/v1/${product}/${chip}?blSPL=${spl(0n)}&teeSPL=${spl(8n)}&snpSPL=${spl(48n)}&ucodeSPL=${spl(56n)}`;
}

async function signedRelease(): Promise<{ tag: string; digest: string; sigstoreBundle: unknown }> {
  const { tag_name: tag } = (await (await relay(`/repos/${CONFIG_REPO}/releases/latest`)).json()) as { tag_name: string };
  const digest = (await (await relay(`/${CONFIG_REPO}/releases/download/${tag}/tinfoil.hash`)).text()).trim();
  const sigstore = (await (await relay(`/repos/${CONFIG_REPO}/attestations/sha256:${digest}`)).json()) as {
    attestations?: { bundle?: unknown }[];
  };
  const sigstoreBundle = sigstore.attestations?.[0]?.bundle;
  if (!sigstoreBundle) throw new Error("Tinfoil's release has no Sigstore signature");
  return { tag, digest, sigstoreBundle };
}

async function vcekBase64(attestationBody: string): Promise<string> {
  const vcek = await (await relay(vcekPath(await gunzip(attestationBody)))).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(vcek)));
}

async function assembleBundle(): Promise<AttestationBundle> {
  const attestation = relay("/.well-known/tinfoil-attestation").then((r) => r.json() as Promise<{ format: string; body: string }>);
  const [document, enclaveCert, release, vcek] = await Promise.all([
    attestation,
    relay("/.well-known/tinfoil-certificate").then(async (r) => ((await r.json()) as { certificate: string }).certificate),
    signedRelease(),
    attestation.then((doc) => vcekBase64(doc.body)),
  ]);
  if (document.format !== SNP_FORMAT) throw new Error("Tinfoil sent an attestation format Karui doesn't know");
  return {
    domain: "inference.tinfoil.sh",
    enclaveAttestationReport: document as AttestationDocument,
    digest: release.digest,
    releaseTag: release.tag,
    sigstoreBundle: release.sigstoreBundle,
    vcek,
    enclaveCert,
  };
}

async function verifyTinfoil(): Promise<string> {
  try {
    const { Verifier } = await import("@tinfoilsh/verifier");
    const result = await new Verifier({ configRepo: CONFIG_REPO }).verifyBundle(await assembleBundle());
    if (!result.tlsPublicKeyFingerprint) throw new Error("no TLS key in the attestation");
    verified = { fingerprint: result.tlsPublicKeyFingerprint.toLowerCase(), staleAfter: Date.now() / 1000 + VERIFIED_FOR_SECONDS };
    return verified.fingerprint;
  } catch (error) {
    console.warn("[karui] Tinfoil attestation:", error);
    throw new Error("Tinfoil's attestation didn't verify in your browser, so nothing was sent.");
  }
}

// SHA-256 of the TLS key of Tinfoil's verified router. Checking a session's channel binding against it is what ties
// the gateway's route to this verification.
export function tinfoilFingerprint(): Promise<string> {
  if (verified && verified.staleAfter > Date.now() / 1000) return Promise.resolve(verified.fingerprint);
  if (!pending) {
    const run = verifyTinfoil().finally(() => {
      if (pending === run) pending = null;
    });
    pending = run;
  }
  return pending;
}
