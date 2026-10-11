// NRAS stamps iat/nbf up to a second ahead of NTP time, and the SDK allows no skew, so the tolerance is added here. Freshness still comes from eat_nonce, which must match our fresh nonce.

import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

const NVIDIA_ISSUER = "https://nras.attestation.nvidia.com";
export const CLOCK_TOLERANCE_SECONDS = 300;

function payloadNonce(payload: string): string {
  const nonce = (JSON.parse(payload) as { nonce?: unknown }).nonce;
  const hex = typeof nonce === "string" ? nonce.replace(/^0x/i, "") : "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("NVIDIA payload has no valid nonce");
  return hex.toLowerCase();
}

function nrasToken(body: unknown): string {
  const entry = Array.isArray(body) ? (body[0] as unknown) : null;
  if (!Array.isArray(entry) || entry[0] !== "JWT" || typeof entry[1] !== "string") {
    throw new Error("Unexpected response from NVIDIA's attestation service");
  }
  return entry[1];
}

export function createGpuEvidenceVerifier(urls: { nrasUrl: string; jwksUrl: string }): (payload: string) => Promise<void> {
  return async (payload) => {
    const nonce = payloadNonce(payload);
    const [nras, jwks] = await Promise.all([
      fetch(urls.nrasUrl, { method: "POST", headers: { "content-type": "application/json" }, body: payload }),
      fetch(urls.jwksUrl),
    ]);
    if (!nras.ok) throw new Error(`NVIDIA's attestation service answered ${nras.status}`);
    if (!jwks.ok) throw new Error(`NVIDIA's key set answered ${jwks.status}`);

    const { payload: claims } = await jwtVerify(
      nrasToken(await nras.json()),
      createLocalJWKSet((await jwks.json()) as JSONWebKeySet),
      {
        algorithms: ["ES384"],
        issuer: NVIDIA_ISSUER,
        requiredClaims: ["exp", "nbf", "iat"],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      }
    );
    const eatNonce = claims.eat_nonce;
    if (typeof eatNonce !== "string" || eatNonce.toLowerCase() !== nonce) {
      throw new Error("NVIDIA's verdict is for a different nonce");
    }
    if (claims["x-nvidia-overall-att-result"] !== true) throw new Error("NVIDIA rejected the GPU evidence");
  };
}
