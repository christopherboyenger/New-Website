import "server-only";
import { z } from "zod";

/**
 * Rejection reason codes for post-content review. The code is kept in the
 * audit record; the readable label (plus the operator's note) is what is
 * stored in posts.review_reason and can be shown to the brand and creator.
 */
export const rejectionReasons = [
  { code: "missing_primary_hashtag", label: "Missing the campaign’s primary hashtag" },
  { code: "platform_not_targeted", label: "Platform not targeted by the campaign" },
  { code: "creator_not_admitted", label: "Creator not admitted to the campaign" },
  { code: "account_not_verified", label: "Social account ownership not verified" },
  { code: "off_brief", label: "Does not follow the playbook brief" },
  { code: "content_policy", label: "Violates content guidelines" },
  { code: "duplicate", label: "Duplicate or reused submission" },
  { code: "unavailable", label: "Post unavailable or private" },
  { code: "other", label: "Other" },
] as const;

export type RejectionReasonCode = (typeof rejectionReasons)[number]["code"];

const codes = rejectionReasons.map((r) => r.code) as [RejectionReasonCode, ...RejectionReasonCode[]];

export const REVIEW_NOTE_MAX = 500;

export const reviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    postId: z.string().trim().min(1, "Missing post.").max(64),
  }),
  z
    .object({
      decision: z.literal("reject"),
      postId: z.string().trim().min(1, "Missing post.").max(64),
      reasonCode: z.enum(codes, { error: "Choose a rejection reason." }),
      note: z.string().trim().max(REVIEW_NOTE_MAX, `Keep the note under ${REVIEW_NOTE_MAX} characters.`).default(""),
    })
    .refine((v) => v.reasonCode !== "other" || v.note.length > 0, { path: ["note"], message: "Describe the reason when choosing “Other”." }),
]);

export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export function rejectionReasonLabel(code: RejectionReasonCode): string {
  return rejectionReasons.find((r) => r.code === code)?.label ?? "Other";
}

/** The text stored in posts.review_reason: the reason label, then the note if any. */
export function formatStoredReason(code: RejectionReasonCode, note: string): string {
  const label = rejectionReasonLabel(code);
  if (!note) return label;
  return code === "other" ? note : `${label} — ${note}`;
}
