import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LANDING_URL } from "@/app/siteUrl";
import { API_URL } from "@/lib/api";

/**
 * Cookie-only middleware must not redirect signed-in auth visitors: the client also needs the IndexedDB AES
 * key.   SessionProvider makes that redirect using the same full-session check as AppLayout.
 */

// Match public routes exactly; prefix matching would expose future subroutes without explicit review.
const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/delete-account",
];

// The documents moved to the landing page; links from e-mails, bookmarks and Polar still lead there.
const LANDING_PAGES = new Set(["/security", "/privacy", "/privacy/en", "/terms", "/terms/en"]);

function isPublicRoute(pathname: string): boolean {

  if (pathname === "/") return true;

  return publicRoutes.includes(pathname);
}

function isProtectedRoute(pathname: string): boolean {
  return !isPublicRoute(pathname);
}

const IS_DEV = process.env.NODE_ENV !== "production";
const RELAY_FILES = new Set(["/mcp-sandbox.html", "/mcp-sandbox.js"]);
const RELAY_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_MCP_SANDBOX_ORIGIN || (IS_DEV ? "http://127.0.0.1:3000" : "https://mcp.karui.eu")
).origin;
const RELAY_HOST = new URL(RELAY_ORIGIN).hostname;
const CAP_ENDPOINT = process.env.NEXT_PUBLIC_CAP_ENDPOINT;
// Next builds request.url from its own listen address, not the Host header, so behind a reverse proxy a redirect
// would send visitors to localhost. Dev runs without a proxy and without this variable, where request.url is right.
const REDIRECT_BASE = process.env.NEXT_PUBLIC_SITE_URL;

// Scripts run only with this response's nonce and what they load ('strict-dynamic'), so an injected <script> or
// on… attribute doesn't; 'self' is the fallback for browsers without 'strict-dynamic'. Styles stay inline because
// components set style attributes. Cap's proof of work needs wasm, and only development needs eval and HMR sockets.
function contentSecurityPolicy(nonce: string): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'"];
  if (IS_DEV) script.push("'unsafe-eval'");
  const connect = ["'self'", API_URL];
  if (CAP_ENDPOINT) connect.push(new URL(CAP_ENDPOINT).origin);
  if (IS_DEV) connect.push("ws:", "wss:");

  const csp = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    // Artifact srcdoc previews inherit this policy rather than using frame-src.
    `frame-src ${RELAY_ORIGIN}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (!IS_DEV) csp.push("upgrade-insecure-requests");
  return csp.join("; ");
}

// Next reads the nonce from the request's CSP header and puts it on its own scripts; the root layout reads x-nonce.
function withContentSecurityPolicy(request: NextRequest): NextResponse {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The connector relay has a relaxed connect-src (next.config.ts), so it must
  // never be served on the app's own origin: there it would hand any injected
  // script an open channel out.
  if (RELAY_FILES.has(pathname)) {
    const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
    return host === RELAY_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  if (LANDING_PAGES.has(pathname)) return NextResponse.redirect(`${LANDING_URL}${pathname}`, 308);

  // Only a hint for redirects: the session itself is an HttpOnly cookie on the API host, checked by the backend.
  const isLoggedIn = request.cookies.has("karui_signed_in");

  let response: NextResponse;
  if (pathname === "/") {
    response = NextResponse.redirect(new URL("/new", REDIRECT_BASE || request.url));
  } else if (!isLoggedIn && isProtectedRoute(pathname)) {
    response = NextResponse.redirect(new URL("/login", REDIRECT_BASE || request.url));
  } else {
    response = withContentSecurityPolicy(request);
  }

  // The token cookie from before the HttpOnly session is readable by script; drop it wherever it's left.
  if (request.cookies.has("karui_token")) response.cookies.delete("karui_token");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|opengraph-image|icon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)",
  ],
};
