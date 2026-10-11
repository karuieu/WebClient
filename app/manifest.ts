import type { MetadataRoute } from "next";

/** Use minimal-ui to keep the domain visible so users can verify where they are signing in. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karui — private AI chat",
    short_name: "Karui",
    description:
      "Multi-model AI chat where everything stored is encrypted in your browser.",
    start_url: "/",
    display: "minimal-ui",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
