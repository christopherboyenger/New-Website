import type { AdmissionStatus } from "@/server/campaign-admission";
import type { ReviewStatus } from "@/server/db/schema";
import { Badge } from "@/components/ui/feedback";

const admission: Record<AdmissionStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  approved: { label: "Joined", tone: "success" },
  requested: { label: "Awaiting approval", tone: "info" },
  rejected: { label: "Not approved", tone: "danger" },
  removed: { label: "Removed", tone: "neutral" },
};

export function AdmissionBadge({ status }: { status: AdmissionStatus }) {
  return <Badge tone={admission[status].tone}>{admission[status].label}</Badge>;
}

const review: Record<ReviewStatus, { label: string; tone: "info" | "success" | "danger" }> = {
  submitted: { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Not approved", tone: "danger" },
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={review[status].tone}>{review[status].label}</Badge>;
}
