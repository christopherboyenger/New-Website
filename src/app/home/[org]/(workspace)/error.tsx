"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for workspace pages. The sidebar and messages dock stay
 * usable; only the main panel is replaced. Nothing was changed by a failed
 * render, and the server-side digest is shown so support can find the log.
 */
export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[workspace] render error", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center" role="alert">
      <AlertTriangle className="size-6 text-warning" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-ink">This page couldn&apos;t load</h1>
      <p className="text-sm text-muted">Nothing was changed. Try again; if it keeps happening, the workspace data may be temporarily unavailable.</p>
      {error.digest ? <p className="text-xs text-subtle">Reference: {error.digest}</p> : null}
      <Button variant="secondary" size="md" className="mt-2" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
