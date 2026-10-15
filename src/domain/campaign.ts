/**
 * Campaign settings vocabulary. Values reflect the inspected campaign form
 * (L17–L22); the Daily/Manual ↔ documented dynamic/fixed mapping is unverified
 * and kept as separate labels (see docs/decisions.md).
 */

export const campaignStatuses = ["inactive", "active", "paused"] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  inactive: "Inactive",
  active: "Active",
  paused: "Paused",
};

export const pricingModes = ["daily", "manual"] as const;
export type PricingMode = (typeof pricingModes)[number];

export const platforms = ["tiktok", "youtube", "instagram", "snapchat", "facebook_reels"] as const;
export type Platform = (typeof platforms)[number];

export const platformLabels: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  snapchat: "Snapchat",
  facebook_reels: "Facebook Reels",
};

export const creatorLevels = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
export type CreatorLevel = (typeof creatorLevels)[number];

export const creatorLevelLabels: Record<CreatorLevel, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
};

/** Minimum creator level filter offered in the campaign form ("all" = no filter). */
export const minCreatorLevelOptions = ["all", "silver", "gold", "platinum", "diamond"] as const;
export type MinCreatorLevel = (typeof minCreatorLevelOptions)[number];

export const minCreatorLevelLabels: Record<MinCreatorLevel, string> = {
  all: "All creators",
  silver: "Silver+",
  gold: "Gold+",
  platinum: "Platinum+",
  diamond: "Diamond",
};

export const genderOptions = ["any", "female", "male"] as const;
export type GenderTarget = (typeof genderOptions)[number];

export interface CampaignTargeting {
  /** ISO 3166-1 alpha-2 codes; empty = all countries. */
  countries: string[];
  /** Empty = all platforms. */
  platforms: Platform[];
  ageMin: number | null;
  ageMax: number | null;
  gender: GenderTarget;
  /** US metro area identifiers; empty = all of the US. */
  metros: string[];
  minCreatorLevel: MinCreatorLevel;
}

export interface CampaignApprovals {
  /** Admission control: whether creators need brand approval to join (not post-content review). */
  requireCreatorApproval: boolean;
  requireDedicatedAccount: boolean;
}

/** Observed form defaults: All countries, All platforms, All creators. */
export const defaultTargeting: CampaignTargeting = {
  countries: [],
  platforms: [],
  ageMin: null,
  ageMax: null,
  gender: "any",
  metros: [],
  minCreatorLevel: "all",
};

export const defaultApprovals: CampaignApprovals = {
  requireCreatorApproval: false,
  requireDedicatedAccount: false,
};

/** Documented minimum daily target for dynamic pricing. */
export const MIN_DAILY_BUDGET_CENTS = 50_00;

/** Hashtag normalization: strip leading '#', lowercase, allow letters/digits/underscore. */
export function normalizeHashtag(input: string): string {
  return input.trim().replace(/^#+/, "").toLowerCase();
}

export function isValidHashtag(tag: string): boolean {
  return /^[a-z0-9_]{2,50}$/.test(tag);
}
