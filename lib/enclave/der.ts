// Reads the DER structures the verifier of Karui's enclave needs: AMD's X.509 certificates and revocation list.
// Strict on purpose: anything it does not expect is an error, never a guess.

export type DerNode = {
  tag: number;
  value: Uint8Array;
  // The node with its tag and length, as signed or compared.
  raw: Uint8Array;
};

export const TAG = {
  integer: 0x02,
  bitString: 0x03,
  octetString: 0x04,
  oid: 0x06,
  utf8String: 0x0c,
  printableString: 0x13,
  ia5String: 0x16,
  utcTime: 0x17,
  generalizedTime: 0x18,
  sequence: 0x30,
  set: 0x31,
} as const;

// Context-specific tag [n] of a constructed value.
export const context = (n: number) => 0xa0 | n;

function readNode(bytes: Uint8Array, offset: number): { node: DerNode; end: number } {
  if (offset + 2 > bytes.length) throw new Error("DER value is cut short");
  const tag = bytes[offset];
  if ((tag & 0x1f) === 0x1f) throw new Error("DER tag is not supported");
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4 || start + lengthBytes > bytes.length) throw new Error("DER length is not supported");
    length = 0;
    for (let i = 0; i < lengthBytes; i++) length = length * 256 + bytes[start + i];
    start += lengthBytes;
  }
  const end = start + length;
  if (end > bytes.length) throw new Error("DER value is cut short");
  return { node: { tag, value: bytes.subarray(start, end), raw: bytes.subarray(offset, end) }, end };
}

function readAll(bytes: Uint8Array): DerNode[] {
  const nodes: DerNode[] = [];
  for (let offset = 0; offset < bytes.length; ) {
    const { node, end } = readNode(bytes, offset);
    nodes.push(node);
    offset = end;
  }
  return nodes;
}

// parseDer reads one value that fills the bytes exactly.
export function parseDer(bytes: Uint8Array): DerNode {
  const { node, end } = readNode(bytes, 0);
  if (end !== bytes.length) throw new Error("DER value has bytes after it");
  return node;
}

export function children(node: DerNode, tag: number = TAG.sequence): DerNode[] {
  if (node.tag !== tag) throw new Error(`DER tag is 0x${node.tag.toString(16)}, not 0x${tag.toString(16)}`);
  return readAll(node.value);
}

export function expectTag(node: DerNode | undefined, tag: number): DerNode {
  if (!node || node.tag !== tag) throw new Error(`DER value with tag 0x${tag.toString(16)} is missing`);
  return node;
}

export function oid(node: DerNode | undefined): string {
  const { value } = expectTag(node, TAG.oid);
  if (value.length === 0) throw new Error("DER object identifier is empty");
  const parts = [Math.floor(value[0] / 40), value[0] % 40];
  let part = 0;
  for (const byte of value.subarray(1)) {
    part = part * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(part);
      part = 0;
    }
  }
  return parts.join(".");
}

// The integer's bytes without the sign padding, so two encodings of one number compare equal.
export function unsignedInteger(node: DerNode | undefined): Uint8Array {
  const { value } = expectTag(node, TAG.integer);
  if (value.length === 0 || value[0] & 0x80) throw new Error("DER integer is not a positive number");
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  return value.subarray(start);
}

export function smallInteger(node: DerNode | undefined): number {
  const bytes = unsignedInteger(node);
  if (bytes.length > 4) throw new Error("DER integer is too large");
  return bytes.reduce((number, byte) => number * 256 + byte, 0);
}

export function bitString(node: DerNode | undefined): Uint8Array {
  const { value } = expectTag(node, TAG.bitString);
  if (value.length === 0 || value[0] !== 0) throw new Error("DER bit string has unused bits");
  return value.subarray(1);
}

const STRING_TAGS: number[] = [TAG.utf8String, TAG.printableString, TAG.ia5String];

export function text(node: DerNode | undefined): string {
  if (!node || !STRING_TAGS.includes(node.tag)) throw new Error("DER string is missing");
  return new TextDecoder("utf-8", { fatal: true }).decode(node.value);
}

export function time(node: DerNode | undefined): Date {
  if (!node || (node.tag !== TAG.utcTime && node.tag !== TAG.generalizedTime)) throw new Error("DER time is missing");
  const digits = node.tag === TAG.utcTime ? 2 : 4;
  const match = new RegExp(`^(\\d{${digits}})(\\d\\d)(\\d\\d)(\\d\\d)(\\d\\d)(\\d\\d)Z$`).exec(text({ ...node, tag: TAG.ia5String }));
  if (!match) throw new Error("DER time is not in UTC to the second");
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const fullYear = digits === 4 ? year : year + (year < 50 ? 2000 : 1900);
  // Date.UTC reads a year below 100 as 19xx, so the year is set afterwards.
  const date = new Date(Date.UTC(2000, month - 1, day, hour, minute, second));
  date.setUTCFullYear(fullYear);
  return date;
}
