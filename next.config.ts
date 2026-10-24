import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import packageJson from "./package.json";

// The app's CSP carries a per-request nonce, so middleware.ts sets it; this file keeps the relay's and the rest.
const isDevBuild = process.env.NODE_ENV !== "production";

// The connector relay (public/mcp-sandbox.*) runs on its own origin so the app can
// keep connect-src locked to our API while MCP connectors reach any server. The
// relay holds no session, key or conversation, and only the app may frame it.
const mcpRelayOrigin = new URL(
  process.env.NEXT_PUBLIC_MCP_SANDBOX_ORIGIN || (isDevBuild ? "http://127.0.0.1:3000" : "https://mcp.karui.eu")
).origin;
const appOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || (isDevBuild ? "http://localhost:3000" : "https://karui.eu")).origin;

function relayHeaders() {
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    `connect-src ${isDevBuild ? "https: http:" : "https:"}`,
    `frame-ancestors ${appOrigin}`,
    "base-uri 'none'",
    "form-action 'none'",
  ];
  return [
    { key: "Content-Security-Policy", value: csp.join("; ") },
    { key: "Referrer-Policy", value: "no-referrer" },
  ];
}

function securityHeaders() {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    // Prevent chat UUIDs from leaking in referrers when users open external links.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  // Apply HSTS only in production so local development does not affect other projects.
  if (!isDevBuild) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }
  return headers;
}

// Empty when building outside a git checkout; the settings then show only the version number.
function gitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_COMMIT: gitCommit(),
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      {
        source: "/:route(verify-email|reset-password|delete-account)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
        ],
      },
      // Later rules override earlier ones key by key. frame-ancestors makes browsers
      // ignore the X-Frame-Options: DENY inherited from the rule above.
      {
        source: "/mcp-sandbox.:ext(html|js)",
        has: [{ type: "host", value: new URL(mcpRelayOrigin).hostname }],
        headers: relayHeaders(),
      },
    ];
  },
  output: "standalone",
  poweredByHeader: false,
  // Use NEXT_DIST_DIR=.next-build for verification; dev and production artifacts cannot safely share .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Enable middleware redirect replay so RSC navigation follows auth redirects without merging
    // incompatible route trees.
    validateRSCRequestHeaders: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
