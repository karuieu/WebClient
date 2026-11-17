import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { fetchCardImage } from "@/lib/chat/cardImages";
import type { CardImages } from "./messageView";

/**
 * Fetches, once and through the server, each card image the shown messages name. The images live in the chat's
 * state because toViewData both uses them and names the addresses. The blob: URLs are freed when the chat closes.
 */
export function useCardImageLoader(addresses: string[], setImages: Dispatch<SetStateAction<CardImages>>): void {
  const started = useRef(new Set<string>());
  const blobs = useRef<string[]>([]);
  const wanted = [...new Set(addresses)].join("\n");

  useEffect(() => {
    for (const address of wanted ? wanted.split("\n") : []) {
      if (started.current.has(address)) continue;
      started.current.add(address);
      fetchCardImage(address).then(
        (src) => {
          blobs.current.push(src);
          setImages((current) => new Map(current).set(address, { state: "shown", src }));
        },
        () => setImages((current) => new Map(current).set(address, { state: "failed" })),
      );
    }
  }, [wanted, setImages]);

  useEffect(() => {
    const urls = blobs.current;
    return () => urls.forEach((src) => URL.revokeObjectURL(src));
  }, []);
}
