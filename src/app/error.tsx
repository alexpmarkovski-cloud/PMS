"use client";

import { useEffect } from "react";

// Route-level error boundary: catches uncaught exceptions from any page
// below the root layout and renders a branded fallback instead of Next's
// default error screen.
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Baseline logging until an error-reporting decision is made
    // (launch_decisions.md — Sentry vs plain logging).
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        An unexpected error occurred. Your data is safe — try again, or come
        back in a few minutes.
      </p>
      {error.digest && (
        <p className="text-xs text-zinc-400">Error reference: {error.digest}</p>
      )}
      <button
        onClick={() => unstable_retry()}
        className="mt-2 rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Try again
      </button>
    </main>
  );
}
