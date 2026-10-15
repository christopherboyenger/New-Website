"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/action-result";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";

/** Joins the workspace; the action redirects there on success and returns the reason otherwise. */
export function AcceptInvitationForm({ acceptAction, workspaceName }: { acceptAction: () => Promise<ActionResult<never> | void>; workspaceName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await acceptAction();
          if (result && !result.ok) setError(result.error);
        });
      }}
      className="flex flex-col gap-4"
    >
      <FormError message={error} />
      <Button type="submit" variant="navy" size="lg" className="h-12 w-full" loading={pending}>
        Join {workspaceName}
      </Button>
    </form>
  );
}
