// Verifies the attestation evidence of Karui's enclave (AMD SEV-SNP) in the browser, so the app encrypts only to a
// key that the measured, published enclave code holds. Our own server relays the evidence and cannot forge it: AMD's
// chip signs the report, AMD's keys certify the chip, and the roots are in the caller's policy.
//
// The checks are the ones the enclave repo's Go verifier makes (internal/attest, on Google's go-sev-guest). Both are
// held to the same vectors (internal/attest/testdata/vectors.json), so the two cannot come to disagree.

import { base64ToUint8Array } from "@/lib/account/crypto";
import { TAG, bitString, children, context, expectTag, oid, parseDer, smallInteger, text, time, unsignedInteger, type DerNode } from "./der";

export type Evidence = { platform: string; document: string };

export type AmdRoots = {
  // AMD's root and intermediate certificates (DER) for one processor generation.
  ark: Uint8Array;
  ask: Uint8Array;
  // The oldest firmware accepted: the eight bytes of a TCB version, bootloader first, microcode last.
  minimumFirmware: Uint8Array;
};

export type AttestationPolicy = {
  nonce: Uint8Array;
  // Launch measurements of the accepted enclave builds.
  measurements: Uint8Array[];
  // By processor generation ("Milan"). A generation without an entry is refused.
  roots: Record<string, AmdRoots>;
  // AMD's revocation list for the generation (DER). AMD signs it, so whoever relays it cannot forge it.
  revocationList: (generation: string) => Promise<Uint8Array>;
  now: Date;
  // Accepts unsigned evidence of an enclave run outside a confidential VM. Development only.
  allowDev?: boolean;
};

export type Verified = { publicKey: Uint8Array; measurement: Uint8Array | null };

const REPORT_DATA_DOMAIN = "karui-enclave-attestation-v1\0";
const NONCE_SIZE = 32;

const REPORT_SIZE = 0x4a0;
const SIGNATURE_OFFSET = 0x2a0;
const SIGNATURE_PART_SIZE = 72;
const P384_SIZE = 48;
const ECDSA_P384_SHA384 = 1;
const OLDEST_REPORT_VERSION = 2;
const NEWEST_REPORT_VERSION = 5;
// From this version on the report names its processor.
const REPORT_VERSION_WITH_PROCESSOR = 3;

const OID = {
  rsaPss: "1.2.840.113549.1.1.10",
  mgf1: "1.2.840.113549.1.1.8",
  sha384: "2.16.840.1.101.3.4.2.2",
  commonName: "2.5.4.3",
  amdProductName: "1.3.6.1.4.1.3704.1.2",
  amdFirmwareLevel: "1.3.6.1.4.1.3704.1.3.",
  amdChipId: "1.3.6.1.4.1.3704.1.4",
} as const;

// Every AMD certificate names AMD the same way.
const AMD_NAME: Record<string, string> = {
  "2.5.4.6": "US",
  "2.5.4.7": "Santa Clara",
  "2.5.4.8": "CA",
  "2.5.4.10": "Advanced Micro Devices",
  "2.5.4.11": "Engineering",
};

function fail(reason: string): never {
  throw new Error(`Karui's enclave failed verification: ${reason}`);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function allZero(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0);
}

// ---- X.509 ----

type Certificate = {
  signed: Uint8Array;
  version: number;
  serial: Uint8Array;
  signatureAlgorithm: DerNode;
  signature: Uint8Array;
  issuer: DerNode;
  subject: DerNode;
  notBefore: Date;
  notAfter: Date;
  publicKey: Uint8Array;
  extensions: Map<string, Uint8Array>;
};

function parseExtensions(node: DerNode | undefined): Map<string, Uint8Array> {
  const extensions = new Map<string, Uint8Array>();
  if (!node) return extensions;
  for (const extension of children(children(node, context(3))[0])) {
    const fields = children(extension);
    extensions.set(oid(fields[0]), expectTag(fields[fields.length - 1], TAG.octetString).value);
  }
  return extensions;
}

function parseCertificate(der: Uint8Array): Certificate {
  const [body, signatureAlgorithm, signature] = children(parseDer(der));
  const fields = children(body);
  if (fields[0]?.tag !== context(0)) fail("a certificate has no version");
  const [version, serial, innerAlgorithm, issuer, validity, subject, publicKey] = fields;
  if (!sameBytes(innerAlgorithm.raw, signatureAlgorithm.raw)) fail("a certificate names two signature algorithms");
  const [notBefore, notAfter] = children(validity);
  return {
    signed: body.raw,
    version: smallInteger(children(version, context(0))[0]) + 1,
    serial: unsignedInteger(serial),
    signatureAlgorithm,
    signature: bitString(signature),
    issuer: expectTag(issuer, TAG.sequence),
    subject: expectTag(subject, TAG.sequence),
    notBefore: time(notBefore),
    notAfter: time(notAfter),
    publicKey: expectTag(publicKey, TAG.sequence).raw,
    extensions: parseExtensions(fields.find((field) => field.tag === context(3))),
  };
}

function nameValues(name: DerNode): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (const set of children(name)) {
    for (const attribute of children(set, TAG.set)) {
      const [type, value] = children(attribute);
      const key = oid(type);
      values.set(key, [...(values.get(key) ?? []), text(value)]);
    }
  }
  return values;
}

function assertAmdName(name: DerNode, commonName: string, what: string): void {
  const values = nameValues(name);
  for (const [type, expected] of Object.entries({ ...AMD_NAME, [OID.commonName]: commonName })) {
    const found = values.get(type) ?? [];
    if (found.length !== 1 || found[0] !== expected) fail(`${what} is not named as AMD names it`);
  }
}

function assertValidAt(certificate: Certificate, now: Date, what: string): void {
  if (now < certificate.notBefore || now > certificate.notAfter) fail(`${what} is not valid today`);
}

// AMD signs with RSASSA-PSS over SHA-384; the salt length comes with the algorithm.
function pssSaltLength(algorithm: DerNode): number {
  const [name, parameters] = children(algorithm);
  if (oid(name) !== OID.rsaPss) fail("a signature is not RSASSA-PSS");
  // Left out, the hash and the mask default to SHA-1, which AMD does not use.
  const found = new Map(children(parameters).map((parameter) => [parameter.tag, children(parameter, parameter.tag)[0]]));
  const [hash, mask, salt] = [found.get(context(0)), found.get(context(1)), found.get(context(2))];
  if (!hash || oid(children(hash)[0]) !== OID.sha384) fail("a signature is not over SHA-384");
  if (!mask || oid(children(mask)[0]) !== OID.mgf1 || oid(children(children(mask)[1])[0]) !== OID.sha384) fail("a signature's mask is not MGF1 with SHA-384");
  if (!salt) fail("a signature names no salt length");
  return smallInteger(salt);
}

async function assertSignedBy(signer: Certificate, algorithm: DerNode, signature: Uint8Array, signed: Uint8Array, what: string): Promise<void> {
  const saltLength = pssSaltLength(algorithm);
  const key = await crypto.subtle.importKey("spki", signer.publicKey as BufferSource, { name: "RSA-PSS", hash: "SHA-384" }, false, ["verify"]).catch(() => fail(`the key that signed ${what} is not an RSA key`));
  const valid = await crypto.subtle.verify({ name: "RSA-PSS", saltLength }, key, signature as BufferSource, signed as BufferSource);
  if (!valid) fail(`${what} is not signed by AMD's key`);
}

// ---- AMD's chain: root (ARK) → intermediate (ASK) → chip (VCEK) ----

type ChipCertificate = { certificate: Certificate; generation: string; firmware: Uint8Array; chipId: Uint8Array };

// Firmware levels sit in extensions .1 to .8 in the byte order of a TCB version.
function chipFirmware(extensions: Map<string, Uint8Array>): Uint8Array {
  return Uint8Array.from({ length: 8 }, (_, i) => {
    const level = extensions.get(`${OID.amdFirmwareLevel}${i + 1}`);
    if (!level) fail("the chip certificate lacks a firmware level");
    const value = smallInteger(parseDer(level));
    if (value > 0xff) fail("the chip certificate has a firmware level out of range");
    return value;
  });
}

// AMD's server leaves the type tag off the chip ID; a certificate that has it is read too.
function chipIdOf(extensions: Map<string, Uint8Array>): Uint8Array {
  const value = extensions.get(OID.amdChipId);
  if (!value) fail("the chip certificate names no chip");
  const chipId = value.length === 64 ? value : expectTag(parseDer(value), TAG.octetString).value;
  if (chipId.length !== 64) fail("the chip certificate's chip ID has the wrong size");
  return chipId;
}

function parseChipCertificate(der: Uint8Array): ChipCertificate {
  const certificate = parseCertificate(der);
  if (certificate.version !== 3) fail("the chip certificate is not version 3");
  assertAmdName(certificate.subject, "SEV-VCEK", "the chip certificate");
  const productName = certificate.extensions.get(OID.amdProductName);
  if (!productName) fail("the chip certificate names no processor");
  const product = expectTag(parseDer(productName), TAG.ia5String);
  return {
    certificate,
    // "Milan-B1" is generation Milan, stepping B1.
    generation: text(product).split("-")[0],
    firmware: chipFirmware(certificate.extensions),
    chipId: chipIdOf(certificate.extensions),
  };
}

async function assertChain(chip: ChipCertificate, generation: string, roots: AmdRoots, now: Date): Promise<Certificate> {
  const ark = parseCertificate(roots.ark);
  const ask = parseCertificate(roots.ask);
  assertAmdName(chip.certificate.issuer, `SEV-${generation}`, "the chip certificate's issuer");
  if (!sameBytes(chip.certificate.issuer.raw, ask.subject.raw)) fail("the chip certificate is not issued by AMD's intermediate key");
  if (!sameBytes(ask.issuer.raw, ark.subject.raw) || !sameBytes(ark.issuer.raw, ark.subject.raw)) fail("AMD's certificates do not chain");
  assertValidAt(ark, now, "AMD's root certificate");
  assertValidAt(ask, now, "AMD's intermediate certificate");
  assertValidAt(chip.certificate, now, "the chip certificate");
  await assertSignedBy(ark, ark.signatureAlgorithm, ark.signature, ark.signed, "AMD's root certificate");
  await assertSignedBy(ark, ask.signatureAlgorithm, ask.signature, ask.signed, "AMD's intermediate certificate");
  await assertSignedBy(ask, chip.certificate.signatureAlgorithm, chip.certificate.signature, chip.certificate.signed, "the chip certificate");
  return ark;
}

// The list is AMD's word on which intermediate keys it has withdrawn. A list past its next update is refused:
// whoever relays it could otherwise keep serving one from before a key was withdrawn.
async function assertNotRevoked(der: Uint8Array, roots: AmdRoots, ark: Certificate, now: Date): Promise<void> {
  const [body, algorithm, signature] = children(parseDer(der));
  await assertSignedBy(ark, algorithm, bitString(signature), body.raw, "the revocation list");
  const fields = children(body);
  // The version is optional; then come the algorithm, the issuer, this update and the next.
  const start = fields[0].tag === TAG.integer ? 1 : 0;
  if (!sameBytes(fields[start].raw, algorithm.raw)) fail("the revocation list names two signature algorithms");
  if (!sameBytes(fields[start + 1].raw, ark.subject.raw)) fail("the revocation list is not issued by AMD's root");
  const nextUpdate = fields[start + 3];
  if (!nextUpdate || (nextUpdate.tag !== TAG.utcTime && nextUpdate.tag !== TAG.generalizedTime)) fail("the revocation list has no next update");
  if (now < time(fields[start + 2]) || now > time(nextUpdate)) fail("the revocation list is out of date");
  const revoked = fields[start + 4]?.tag === TAG.sequence ? children(fields[start + 4]) : [];
  const intermediate = parseCertificate(roots.ask).serial;
  if (revoked.some((entry) => sameBytes(unsignedInteger(children(entry)[0]), intermediate))) fail("AMD has revoked its intermediate key");
}

// ---- The report ----

type Report = {
  bytes: Uint8Array;
  version: number;
  policy: bigint;
  generation: string | null;
  reportData: Uint8Array;
  measurement: Uint8Array;
  chipId: Uint8Array;
  firmware: { current: Uint8Array; reported: Uint8Array; committed: Uint8Array; launch: Uint8Array };
};

const POLICY_BIT = { reservedOne: 17n, migrationAgent: 18n, debug: 19n, cxl: 21n, firstUnused: 26n } as const;

function generationOf(family: number, model: number): string {
  if (family === 0x19 && model === 0x01) return "Milan";
  if (family === 0x19 && model === 0x11) return "Genoa";
  if (family === 0x1a && model === 0x02) return "Turin";
  return "Unknown";
}

function parseReport(bytes: Uint8Array): Report {
  if (bytes.length !== REPORT_SIZE) fail("the report has the wrong size");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const zero = (from: number, to: number) => allZero(bytes.subarray(from, to)) || fail("the report has data in a reserved field");
  const version = view.getUint32(0x00, true);
  if (version < OLDEST_REPORT_VERSION || version > NEWEST_REPORT_VERSION) fail("the report's version is not supported");
  const policy = view.getBigUint64(0x08, true);
  if (!((policy >> POLICY_BIT.reservedOne) & 1n) || policy >> POLICY_BIT.firstUnused) fail("the guest policy is malformed");
  if (view.getUint32(0x34, true) !== ECDSA_P384_SHA384) fail("the report's signature algorithm is not supported");
  // Bits 2 to 4 say which key signed: 0 is the chip's own key, the only one accepted.
  if (view.getUint32(0x48, true) >> 2) fail("the report is not signed by the chip's own key");

  const namesProcessor = version >= REPORT_VERSION_WITH_PROCESSOR;
  zero(0x4c, 0x50);
  zero(namesProcessor ? 0x18b : 0x188, 0x1a0);
  zero(0x1eb, 0x1ec);
  zero(0x1ef, 0x1f0);
  zero(0x208, SIGNATURE_OFFSET);
  zero(SIGNATURE_OFFSET + 2 * SIGNATURE_PART_SIZE, REPORT_SIZE);

  const [family, model, stepping] = [bytes[0x188], bytes[0x189], bytes[0x18a]];
  const tcb = (offset: number) => bytes.subarray(offset, offset + 8);
  return {
    bytes,
    version,
    policy,
    generation: namesProcessor && (family | model | stepping) !== 0 ? generationOf(family, model) : null,
    reportData: bytes.subarray(0x50, 0x90),
    measurement: bytes.subarray(0x90, 0xc0),
    chipId: bytes.subarray(0x1a0, 0x1e0),
    firmware: { current: tcb(0x38), reported: tcb(0x180), committed: tcb(0x1e0), launch: tcb(0x1f0) },
  };
}

// The report holds r and s as 72 little-endian bytes each; WebCrypto takes 48 big-endian bytes each.
function signatureOf(report: Uint8Array): Uint8Array {
  const part = (offset: number) => {
    const bigEndian = report.slice(offset, offset + SIGNATURE_PART_SIZE).reverse();
    if (!allZero(bigEndian.subarray(0, SIGNATURE_PART_SIZE - P384_SIZE))) fail("the report's signature is malformed");
    return bigEndian.subarray(SIGNATURE_PART_SIZE - P384_SIZE);
  };
  return Uint8Array.from([...part(SIGNATURE_OFFSET), ...part(SIGNATURE_OFFSET + SIGNATURE_PART_SIZE)]);
}

async function assertSignedByChip(report: Report, chip: Certificate): Promise<void> {
  const key = await crypto.subtle.importKey("spki", chip.publicKey as BufferSource, { name: "ECDSA", namedCurve: "P-384" }, false, ["verify"]).catch(() => fail("the chip's key is not on curve P-384"));
  const signed = report.bytes.subarray(0, SIGNATURE_OFFSET);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-384" }, key, signatureOf(report.bytes) as BufferSource, signed as BufferSource);
  if (!valid) fail("the report is not signed by the chip");
}

// Every level of a is at most the same level of b.
function notNewer(a: Uint8Array, b: Uint8Array): boolean {
  return a.every((level, i) => level <= b[i]);
}

function assertFirmware(report: Report, chip: ChipCertificate, minimum: Uint8Array): void {
  const { current, reported, committed, launch } = report.firmware;
  if (!notNewer(committed, current)) fail("the committed firmware is newer than the running one");
  if (!notNewer(minimum, launch) || !notNewer(minimum, reported)) fail("the processor firmware is older than the minimum");
  if (!sameBytes(reported, chip.firmware) || !notNewer(chip.firmware, current)) fail("the chip certificate is for other firmware");

  const build = (offset: number) => report.bytes[offset];
  const api = (offset: number) => (report.bytes[offset + 2] << 8) | report.bytes[offset + 1];
  if (build(0x1ec) > build(0x1e8) || api(0x1ec) > api(0x1e8)) fail("the committed firmware build is newer than the running one");
}

function assertGuestPolicy(policy: bigint): void {
  const has = (bit: bigint) => ((policy >> bit) & 1n) === 1n;
  // The host can read the memory of a debug guest, and a migration agent can move the guest elsewhere.
  if (has(POLICY_BIT.debug)) fail("the guest can be debugged");
  if (has(POLICY_BIT.migrationAgent)) fail("the guest allows a migration agent");
  if (has(POLICY_BIT.cxl)) fail("the guest allows CXL memory");
}

async function reportDataFor(nonce: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
  const committed = Uint8Array.from([...new TextEncoder().encode(REPORT_DATA_DOMAIN), ...nonce, ...publicKey]);
  return new Uint8Array(await crypto.subtle.digest("SHA-512", committed as BufferSource));
}

// ---- Evidence ----

type SnpDocument = { report?: string; public_key?: string; chip_cert?: string };
type DevDocument = { nonce?: string; public_key?: string };

function decodeDocument<T>(evidence: Evidence): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64ToUint8Array(evidence.document))) as T;
  } catch {
    return fail("the evidence cannot be read");
  }
}

async function verifySnp(document: SnpDocument, policy: AttestationPolicy): Promise<Verified> {
  if (!document.report || !document.public_key) fail("the evidence is incomplete");
  // The browser cannot ask AMD for the chip certificate, so the enclave has to bring it.
  if (!document.chip_cert) fail("the evidence carries no chip certificate");
  const publicKey = base64ToUint8Array(document.public_key);
  // The host's certificate table follows the report and is not used: the chain is checked against our roots.
  const report = parseReport(base64ToUint8Array(document.report).subarray(0, REPORT_SIZE));
  const chip = parseChipCertificate(base64ToUint8Array(document.chip_cert));

  const generation = report.generation ?? chip.generation;
  const roots = policy.roots[generation];
  if (!roots) fail(`processor generation ${generation} is not accepted`);
  const ark = await assertChain(chip, generation, roots, policy.now);
  await assertNotRevoked(await policy.revocationList(generation), roots, ark, policy.now);
  await assertSignedByChip(report, chip.certificate);

  assertGuestPolicy(report.policy);
  if (!sameBytes(report.reportData, await reportDataFor(policy.nonce, publicKey))) fail("the report is not for this request and key");
  assertFirmware(report, chip, roots.minimumFirmware);
  if (!allZero(report.chipId) && !sameBytes(report.chipId, chip.chipId)) fail("the chip certificate is for another chip");
  if (!policy.measurements.some((accepted) => sameBytes(accepted, report.measurement))) fail("the enclave runs code that is not an accepted build");
  return { publicKey, measurement: report.measurement };
}

function verifyDev(document: DevDocument, policy: AttestationPolicy): Verified {
  if (!policy.allowDev) fail("the evidence is unsigned");
  if (!document.nonce || !document.public_key) fail("the evidence is incomplete");
  if (!sameBytes(base64ToUint8Array(document.nonce), policy.nonce)) fail("the evidence is not for this request");
  return { publicKey: base64ToUint8Array(document.public_key), measurement: null };
}

// verifyEvidence returns the enclave's public key once everything about the evidence holds, and throws otherwise.
export async function verifyEvidence(evidence: Evidence, policy: AttestationPolicy): Promise<Verified> {
  if (policy.nonce.length !== NONCE_SIZE) fail("the nonce has the wrong size");
  try {
    if (evidence.platform === "sev-snp") return await verifySnp(decodeDocument<SnpDocument>(evidence), policy);
    if (evidence.platform === "dev") return verifyDev(decodeDocument<DevDocument>(evidence), policy);
  } catch (error) {
    // A malformed certificate or report throws from the parser; it is a failed verification like any other.
    if (error instanceof Error && error.message.startsWith("Karui's enclave failed verification")) throw error;
    fail(error instanceof Error ? error.message : "the evidence is malformed");
  }
  return fail("the evidence is of an unknown kind");
}
