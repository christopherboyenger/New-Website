"use client";

import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] render error", error.digest ?? error.name);
  }, [error]);
  const notConfigured = error.message?.includes("DATABASE_URL");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold text-ink">{notConfigured ? "This deployment is not fully configured" : "Something went wrong"}</h1>
      <p className="max-w-md text-sm text-muted">
        {notConfigured
          ? "The database has not been provisioned for this environment yet."
          : "The page could not be loaded. Nothing was changed. Try again, and contact support if it keeps happening."}
      </p>
      {error.digest ? <p className="text-xs text-subtle">Reference: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="mt-2 rounded-[8px] bg-ink px-4 py-2 text-sm font-medium text-white">
        Try again
      </button>
    </main>
  );
}
