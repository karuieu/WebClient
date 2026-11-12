// What the app trusts about Karui's enclave: AMD's certificates, the oldest firmware and the builds it accepts.
// Everything here is public; changing it changes whom the app encrypts to, so it changes only with a release.

import { base64ToUint8Array } from "@/lib/account/crypto";
import type { AmdRoots } from "./karuiAttestation";

// AMD's root (ARK-Milan) and intermediate (SEV-Milan) certificates, as AMD's key server publishes them at
// kdsintf.amd.com/vcek/v1/Milan/cert_chain and Google's go-sev-guest ships them. SHA-256 of the DER:
//   ARK 69d063b45344d26a2e94e1f4210de49ef555308287d4c174445c95639a540bcd
//   ASK 67d303bd3905fd38db8b20e0793699870e7fa612eaad5dec358293fd8c0bac1b
const MILAN_ARK =
  "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";
const MILAN_ASK =
  "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" +
  "NtpS9ThjNX4uve5thyfE2DgoxRFvY1CsoF5M";

// The oldest firmware accepted, as a TCB version from bootloader to microcode: bootloader 4, SNP 0x1D, microcode
// 0xDE. Older firmware has known ways for the host to read or alter guest memory (AMD-SB-3034, AMD-SB-3027). The
// enclave repo's verifier has the same levels (internal/attest); they change together.
const MILAN_MINIMUM_FIRMWARE = Uint8Array.from([4, 0, 0, 0, 0, 0, 0x1d, 0xde]);

// By processor generation. One without an entry is refused until its certificates and firmware levels are known.
export const AMD_ROOTS: Record<string, AmdRoots> = {
  Milan: { ark: base64ToUint8Array(MILAN_ARK), ask: base64ToUint8Array(MILAN_ASK), minimumFirmware: MILAN_MINIMUM_FIRMWARE },
};

// Launch measurements (hex) of the enclave builds the app accepts, from measurements.json of a reproducible build
// of the enclave repo. A new image, or new firmware at the host, has a new measurement: release the app with both
// the old and the new one before the image changes, and drop the old one in the release after. While the list is
// empty the app refuses every enclave.
export const ACCEPTED_MEASUREMENTS: string[] = [];
