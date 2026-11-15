import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karui — private AI chat",
    short_name: "Karui",
    description:
      "Multi-model AI chat where everything stored is encrypted in your browser.",
    // Not "/": signed out, that redirects to the landing on another origin, which a home screen app opens in a browser overlay.
    start_url: "/new",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    // PNGs next to the SVG: home screens don't take SVG. iOS reads app/apple-icon.png instead.
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      { src: "/brand/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/brand/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
    ],
  };
}
