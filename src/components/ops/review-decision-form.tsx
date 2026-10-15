"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FormError, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/action-result";
import { reviewPostAction } from "@/server/ops/actions";
import type { ReviewOutcome } from "@/server/ops/review";

export interface ReasonOption {
  code: string;
  label: string;
}

/**
 * Approve / Reject controls for one submitted post. Rejecting requires a
 * reason (and a note for "Other"). The decision is applied only after the
 * server confirms it; a post already decided elsewhere reports a conflict.
 */
export function ReviewDecisionForm({ postId, reasons, noteMax }: { postId: string; reasons: ReasonOption[]; noteMax: number }) {
  const [state, action, pending] = useActionState<ActionResult<ReviewOutcome> | null, FormData>(reviewPostAction, null);
  const [rejecting, setRejecting] = useState(false);
  // Controlled so a failed submission keeps the operator's choices (form actions reset uncontrolled fields).
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const { notify } = useToast();
  const router = useRouter();
  const reasonRef = useRef<HTMLSelectElement>(null);
  const uid = useId();
  const reasonId = `${uid}-reason`;
  const noteId = `${uid}-note`;
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const conflict = state && !state.ok && (state.code === "conflict" || state.code === "not_found");

  useEffect(() => {
    if (state?.ok) notify(state.message ?? "Decision saved.", "success");
  }, [state, notify]);

  useEffect(() => {
    if (rejecting) reasonRef.current?.focus();
  }, [rejecting]);

  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-ink-2">
        {state.data.status === "approved" ? "Approved." : "Rejected."} Updating the queue…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state && !state.ok && !fieldErrors ? (
        <div className="flex flex-col gap-2">
          <FormError message={state.error} />
          {conflict ? (
            <Button variant="secondary" size="sm" className="self-start max-md:h-11" onClick={() => router.refresh()}>
              Reload queue
            </Button>
          ) : null}
        </div>
      ) : null}

      {!rejecting ? (
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit" loading={pending} className="max-md:h-11 max-md:flex-1">
            <Check className="size-4" aria-hidden="true" />
            Approve
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setRejecting(true)} className="max-md:h-11 max-md:flex-1">
            <X className="size-4" aria-hidden="true" />
            Reject…
          </Button>
        </form>
      ) : (
        <form action={action} className="flex flex-col gap-3 rounded-[10px] border border-line bg-canvas p-3" aria-label="Reject post">
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="decision" value="reject" />
          {fieldErrors ? <FormError message={state && !state.ok ? state.error : null} /> : null}
          <Field id={reasonId} label="Rejection reason" error={fieldErrors?.reasonCode}>
            <Select
              ref={reasonRef}
              id={reasonId}
              name="reasonCode"
              required
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              {...describedBy(reasonId, { error: fieldErrors?.reasonCode })}>
              <option value="" disabled>
                Choose a reason
              </option>
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id={noteId}
            label="Note"
            optional
            description="Shown with the reason. Required when the reason is “Other”."
            error={fieldErrors?.note}
          >
            <Textarea
              id={noteId}
              name="note"
              maxLength={noteMax}
              required={reasonCode === "other"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-20"
              {...describedBy(noteId, { description: true, error: fieldErrors?.note })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" loading={pending} className="max-md:h-11 max-md:flex-1">
              Reject post
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setRejecting(false)} className="max-md:h-11 max-md:flex-1">
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
