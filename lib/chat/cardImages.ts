import { base64ToUint8Array } from "@/lib/account/crypto";
import { enclaveCall } from "@/lib/enclave/karuiEnclave";

/**
 * A card's image as a blob: URL. Karui's enclave fetches it, because the app's CSP allows no image host and a direct
 * load would show the user's address and the page to that host. The caller revokes the URL when done.
 */
export async function fetchCardImage(address: string): Promise<string> {
  const image = await enclaveCall<{ content_type: string; data: string }>("image", { url: address });
  return URL.createObjectURL(new Blob([new Uint8Array(base64ToUint8Array(image.data))], { type: image.content_type }));
}
