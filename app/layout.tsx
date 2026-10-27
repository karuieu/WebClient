import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SessionProvider } from "@/components/SessionProvider";
import { ToastProvider } from "@/components/Toast";
import { MotionProvider } from "@/components/motion";
import { themeScript } from "@/lib/ui/themeScript";
import { SITE_URL } from "./siteUrl";
import "./globals.css";
import "./kit.css";

// Bundle the font for offline, reproducible builds without Google requests; retain its OFL license file.
const sans = localFont({
  src: "./fonts/SchibstedGrotesk.woff2",
  variable: "--font-sans",
  weight: "400 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Karui · Private AI",
  description:
    "Multi-model AI chat where everything stored is encrypted in your browser. The server only ever holds ciphertext. Honest about the one moment it can't be: inference.",
  openGraph: {
    type: "website",
    siteName: "Karui",
    url: SITE_URL,
    title: "Karui · Talk to AI. Tell us nothing.",
    description:
      "A private, multi-model AI workspace. Everything we store is sealed on your device first, and we say plainly what happens at inference.",
    // Leave images to app/opengraph-image.tsx; a manual URL would override the generated file.
  },
  twitter: {
    card: "summary_large_image",
    title: "Karui · Talk to AI. Tell us nothing.",
    description:
      "A private, multi-model AI workspace. Everything we store is sealed on your device first, and we say plainly what happens at inference.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The per-request nonce from middleware.ts; the CSP blocks inline scripts without it. Reading headers also makes
  // every page render per request, which the nonce needs.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Browsers hide a nonce from the DOM, so the client sees "" where the server rendered it. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Restore SSR-hidden entrances without JS; !important must override Motion's inline styles. */}
        <noscript
          dangerouslySetInnerHTML={{
            __html: `<style>[data-motion-effect]{opacity:1!important;filter:none!important;transform:none!important}</style>`,
          }}
        />
      </head>
      <body
        className={`${sans.variable} antialiased`}
      >
        <MotionProvider>
          <SessionProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </SessionProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
