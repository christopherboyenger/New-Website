"use server";

import { revalidatePath } from "next/cache";
import { fromZodError, ok, runAction, type ActionResult } from "../action-result";
import { requireOperatorAction } from "./operator";
import { reviewPost, type ReviewOutcome } from "./review";
import { reviewDecisionSchema } from "./review-reasons";

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/** Approve or reject a submitted post from the operator review queue. */
export async function reviewPostAction(_prev: ActionResult<ReviewOutcome> | null, formData: FormData): Promise<ActionResult<ReviewOutcome>> {
  return runAction(async () => {
    const operator = await requireOperatorAction();
    const parsed = reviewDecisionSchema.safeParse({
      decision: field(formData, "decision"),
      postId: field(formData, "postId"),
      reasonCode: field(formData, "reasonCode") || undefined,
      note: field(formData, "note") ?? "",
    });
    if (!parsed.success) return fromZodError(parsed.error, "Check the decision fields and try again.");
    const outcome = await reviewPost(operator, parsed.data);
    revalidatePath("/ops", "layout");
    return ok(outcome, outcome.status === "approved" ? "Post approved." : "Post rejected.");
  });
}
