/**
 * Column labels for the Organic tables (L03/L04 reference wording). Kept in a
 * plain module so the server page can build sort links with them.
 */
import type { CampaignSort, PlaybookSort, PostSortKey } from "@/domain/organic-url-state";

export interface SortLink {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  href: string;
}

export const campaignSortLabels: Record<CampaignSort, string> = {
  active: "Active",
  name: "Campaign",
  views: "Views",
  spend: "Spend",
  cpm: "CPM",
  playbooks: "Playbooks",
  posts: "Posts",
  creators: "Creators",
  avg_views: "Avg Views/post",
};

export const playbookSortLabels: Record<PlaybookSort, string> = {
  active: "Active",
  name: "Playbook",
  views: "Views",
  spend: "Spend",
  cpm: "CPM",
  posts: "Posts",
  creators: "Creators",
  avg_views: "Avg Views/post",
};

export const postSortLabels: Record<PostSortKey, string> = {
  posted: "Posted",
  views: "Lifetime views",
  range_views: "Views in range",
  likes: "Likes",
  comments: "Comments",
  bookmarks: "Bookmarks",
  shares: "Shares",
  spend: "Spend in range",
  engagement: "Engagement",
  handle: "Creator",
};
