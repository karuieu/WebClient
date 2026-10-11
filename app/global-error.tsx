"use client";

import { useEffect } from "react";

/** This replaces the failed root layout, so render html/body and inline styles without relying on its CSS or fonts. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[karui] global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f4f2f8",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "2rem 1.5rem" }}>
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: "2rem",
              fontWeight: 300,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Karui didn&apos;t start.
          </h1>

          <p
            style={{
              marginTop: "1.25rem",
              fontSize: "1rem",
              lineHeight: 1.65,
              color: "#8f8a99",
            }}
          >
            Something failed before the app could load. Reloading usually fixes
            it. Nothing stored on this device was changed.
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                padding: "0.875rem 1rem",
                border: "1px solid #262230",
                borderRadius: "0.75rem",
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: "0.8125rem",
                lineHeight: 1.6,
                color: "#5c5766",
                wordBreak: "break-all",
              }}
            >
              {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              marginTop: "2rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.625rem",
              border: "none",
              background: "linear-gradient(180deg, #8d55f2, #7c3aed)",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
