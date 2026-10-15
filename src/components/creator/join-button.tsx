"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action-result";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Joins (or asks to join) one campaign; the resulting state comes from the server, never assumed. */
export function JoinButton({
  campaignId,
  campaignName,
  requiresApproval,
  joinAction,
  openAfterJoin,
}: {
  campaignId: string;
  campaignName: string;
  requiresApproval: boolean;
  joinAction: (campaignId: string) => Promise<ActionResult<{ status: "requested" | "approved" }>>;
  /** Navigate to the campaign once admitted. */
  openAfterJoin?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { notify } = useToast();
  const router = useRouter();

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <Button
        className="max-md:h-11"
        loading={pending}
        aria-label={`${requiresApproval ? "Ask to join" : "Join"} ${campaignName}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await joinAction(campaignId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            notify(result.data.status === "approved" ? "You joined the campaign." : "Request sent. The brand will review it.", "success");
            if (openAfterJoin && result.data.status === "approved") router.push(`/creator/campaigns/${campaignId}`);
          })
        }
      >
        {requiresApproval ? "Ask to join" : "Join campaign"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger sm:max-w-64 sm:text-right">
          {error}
        </p>
      ) : null}
    </div>
  );
}
