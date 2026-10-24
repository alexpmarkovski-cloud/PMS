"use client";

import { useEffect } from "react";

// Last-resort boundary: only renders when the root layout itself crashes,
// so it must provide its own <html> and <body> (it replaces the layout).
// Styles are inline because globals.css may not have loaded.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ color: "#71717a", maxWidth: "28rem", margin: 0 }}>
          An unexpected error occurred. Try again, or come back in a few
          minutes.
        </p>
        {error.digest && (
          <p style={{ color: "#a1a1aa", fontSize: "12px", margin: 0 }}>
            Error reference: {error.digest}
          </p>
        )}
        <button
          onClick={() => unstable_retry()}
          style={{
            marginTop: "8px",
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            background: "#18181b",
            color: "#fff",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
