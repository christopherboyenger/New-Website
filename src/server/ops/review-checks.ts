import "server-only";
import { campaignStatusLabels, platformLabels, type CampaignStatus, type Platform } from "@/domain/campaign";

/**
 * Automatic objective checks for a submitted post. They inform the operator;
 * they never approve or reject on their own (production-requirements.md
 * "Review…": rule automation covers objective requirements, ambiguous content
 * goes to an operator queue).
 */
export type CheckStatus = "pass" | "fail" | "warn";

export type CheckKey = "primary_hashtag" | "platform_targeted" | "creator_admitted" | "campaign_status" | "account_verified";

export interface ObjectiveCheck {
  key: CheckKey;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface CheckInput {
  caption: string;
  platform: Platform;
  campaign: {
    primaryHashtag: string;
    status: CampaignStatus;
    targetPlatforms: Platform[];
    requireCreatorApproval: boolean;
  } | null;
  /** Creator's admission record for the campaign, if any. */
  admissionStatus: "requested" | "approved" | "rejected" | "removed" | null;
  /** The post's linked social account, or null when none is linked. */
  account: {
    verification: "unverified" | "pending" | "verified" | "failed";
    /** The account belongs to the creator who submitted the post. */
    ownedBySubmitter: boolean;
    platform: Platform;
  } | null;
}

/** True when the caption contains `#tag` as a whole hashtag (case-insensitive; `#tagline` does not match `#tag`). */
export function captionHasHashtag(caption: string, tag: string): boolean {
  const normalized = tag.replace(/^#+/, "").toLowerCase();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_#])#${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(caption);
}

export function computeObjectiveChecks(input: CheckInput): ObjectiveCheck[] {
  const { campaign } = input;
  const checks: ObjectiveCheck[] = [];

  checks.push(
    !campaign
      ? { key: "primary_hashtag", label: "Primary hashtag in caption", status: "fail", detail: "The post is not attributed to a campaign." }
      : captionHasHashtag(input.caption, campaign.primaryHashtag)
        ? { key: "primary_hashtag", label: "Primary hashtag in caption", status: "pass", detail: `Caption contains #${campaign.primaryHashtag}.` }
        : { key: "primary_hashtag", label: "Primary hashtag in caption", status: "fail", detail: `Caption does not contain #${campaign.primaryHashtag}.` },
  );

  const platformName = platformLabels[input.platform];
  checks.push(
    !campaign
      ? { key: "platform_targeted", label: "Platform targeted", status: "fail", detail: "No campaign targeting to compare against." }
      : campaign.targetPlatforms.length === 0
        ? { key: "platform_targeted", label: "Platform targeted", status: "pass", detail: `${platformName}; the campaign targets all platforms.` }
        : campaign.targetPlatforms.includes(input.platform)
          ? { key: "platform_targeted", label: "Platform targeted", status: "pass", detail: `${platformName} is in the campaign’s targeting.` }
          : {
              key: "platform_targeted",
              label: "Platform targeted",
              status: "fail",
              detail: `${platformName} is not targeted (campaign targets ${campaign.targetPlatforms.map((p) => platformLabels[p]).join(", ")}).`,
            },
  );

  checks.push(admissionCheck(input));

  checks.push(
    !campaign
      ? { key: "campaign_status", label: "Campaign active", status: "fail", detail: "The post is not attributed to a campaign." }
      : campaign.status === "active"
        ? { key: "campaign_status", label: "Campaign active", status: "pass", detail: "The campaign is active." }
        : {
            key: "campaign_status",
            label: "Campaign active",
            status: "warn",
            detail: `The campaign is ${campaignStatusLabels[campaign.status].toLowerCase()}; approved posts earn nothing while it is not active.`,
          },
  );

  checks.push(accountCheck(input));

  return checks;
}

function accountCheck(input: CheckInput): ObjectiveCheck {
  const label = "Social account verified";
  const { account } = input;
  if (!account) return { key: "account_verified", label, status: "fail", detail: "No linked social account." };
  if (!account.ownedBySubmitter) return { key: "account_verified", label, status: "fail", detail: "The linked account belongs to a different creator." };
  if (account.platform !== input.platform) {
    return { key: "account_verified", label, status: "fail", detail: `The linked account is on ${platformLabels[account.platform]}, not ${platformLabels[input.platform]}.` };
  }
  if (account.verification !== "verified") return { key: "account_verified", label, status: "fail", detail: `Account verification is ${account.verification}.` };
  return { key: "account_verified", label, status: "pass", detail: "Account ownership is verified." };
}

function admissionCheck(input: CheckInput): ObjectiveCheck {
  const label = "Creator admitted";
  const { campaign, admissionStatus } = input;
  if (!campaign) return { key: "creator_admitted", label, status: "fail", detail: "The post is not attributed to a campaign." };
  if (admissionStatus === "approved") return { key: "creator_admitted", label, status: "pass", detail: "Admission approved." };
  if (admissionStatus === "rejected" || admissionStatus === "removed") {
    return { key: "creator_admitted", label, status: "fail", detail: `Admission ${admissionStatus}.` };
  }
  if (!campaign.requireCreatorApproval) {
    return { key: "creator_admitted", label, status: "pass", detail: "The campaign does not require admission approval." };
  }
  return {
    key: "creator_admitted",
    label,
    status: "fail",
    detail: admissionStatus === "requested" ? "Admission requested, not yet approved." : "No admission record for this campaign.",
  };
}

export function summarizeChecks(checks: ObjectiveCheck[]): { failed: number; warned: number; passed: number } {
  return {
    failed: checks.filter((c) => c.status === "fail").length,
    warned: checks.filter((c) => c.status === "warn").length,
    passed: checks.filter((c) => c.status === "pass").length,
  };
}
