// Supplement @phala/aci-verifier 0.7.3's production list. The downloaded image's
// sha256sum.txt hashes to this OS hash and pins metadata.json with is_dev=false.
// dstack-0.5.12, reviewed 2026-11-06: https://download.dstack.org/os-images/mr_8db40cb23008d6213668b5816702d100b37b859a8a5bfd18d938ae3a1b3715bd.tar.gz
const REVIEWED_OS_IMAGES = new Map([
  ["8db40cb23008d6213668b5816702d100b37b859a8a5bfd18d938ae3a1b3715bd",
    "9381eb17a317a6ebabc892bd4601743106b3f7415f2a82fe73c24b1b12d9fb982a26e7c49632fe2fae01ffbae6bf5ea2"],
]);

// Call only after id-1 and id-4 passed: the quote must authenticate this event log.
// Check both payload and measured digest; replaying RTMR3 alone doesn't bind event labels or payloads.
export function isReviewedGatewayOs(eventLog: unknown): boolean {
  if (typeof eventLog !== "string") return false;
  try {
    const events: unknown = JSON.parse(eventLog);
    if (!Array.isArray(events)) return false;
    let measurement: { hash: string; digest: string } | undefined;
    for (const entry of events) {
      if (entry === null || typeof entry !== "object") return false;
      const event = entry as Record<string, unknown>;
      if (event.imr !== 3 || event.event_type !== 0x08000001) continue;
      if (event.event === "system-ready") break;
      if (event.event !== "os-image-hash") continue;
      if (measurement || typeof event.event_payload !== "string" || typeof event.digest !== "string") return false;
      measurement = { hash: event.event_payload.toLowerCase(), digest: event.digest.toLowerCase() };
    }
    return measurement !== undefined && REVIEWED_OS_IMAGES.get(measurement.hash) === measurement.digest;
  } catch {
    return false;
  }
}
