import { ImageResponse } from "next/og";
import { WORDMARK_PATH, WORDMARK_VIEWBOX } from "@/components/kit/logo-paths";

/** Satori supports flexbox only; elements with multiple children need explicit display: flex. */
export const alt = "Karui — encrypted AI workspace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          padding: "76px 84px",
          color: "#f4f2f8",

          borderTop: "8px solid #7c3aed",
        }}
      >
        <svg width="190" height="46" viewBox={WORDMARK_VIEWBOX}>
          <path d={WORDMARK_PATH} fill="#f4f2f8" />
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: 82, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Talk to AI. Tell us nothing.
          </div>
          <div style={{ fontSize: 34, lineHeight: 1.35, color: "#a8a3b4", maxWidth: "900px" }}>
            Everything we store is encrypted in your browser. The server only ever holds ciphertext.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
