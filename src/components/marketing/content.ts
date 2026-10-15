/**
 * Copy shared by the public pages. Describes what the product does; contains
 * no metrics, customer names, creator counts or market claims (production-ui-
 * plan.md "Asset requirements and provenance").
 */

export interface ProductSection {
  /** Homepage anchor (`/#<id>`), also the preview tab key. */
  id: "playbooks" | "analytics" | "posts-to-ads" | "ai-agent";
  label: string;
  title: string;
  body: string;
  points: string[];
}

export const productSections: ProductSection[] = [
  {
    id: "playbooks",
    label: "Playbooks",
    title: "Brief creators with a playbook",
    body: "A playbook is the brief creators follow: the scenes to film, reference videos, and the hashtags and descriptions every post carries.",
    points: ["Scene-by-scene direction for UGC and slideshow formats", "Reference videos creators can watch before filming", "Drafts stay private until you publish them"],
  },
  {
    id: "analytics",
    label: "Analytics",
    title: "See which posts and playbooks work",
    body: "Organic reporting follows every approved post by campaign, playbook and creator, with views, spend and CPM by UTC day.",
    points: ["Compare campaigns, playbooks and posts side by side", "Created and active posts reported separately", "Export through the reporting API"],
  },
  {
    id: "posts-to-ads",
    label: "Posts to ads",
    title: "Turn approved posts into paid ads",
    body: "Connect your Meta or TikTok ad account and launch approved creator posts as ads, using your own naming, tracking and call-to-action defaults.",
    points: ["Ad naming templates and tracking parameters", "Default calls to action per platform", "Organic and paid results reported separately"],
  },
  {
    id: "ai-agent",
    label: "AI agent",
    title: "Ask your reporting in plain language",
    body: "Connect an AI assistant to your workspace through the MCP endpoint and ask about campaigns, playbooks and posts. It reads the same reporting you see in the dashboard.",
    points: ["Read-only access you grant and can revoke", "Answers come from your workspace's reporting data", "Works with MCP-compatible assistants"],
  },
];

export interface WorkflowStep {
  title: string;
  summary: string;
  you: string;
  platform: string;
}

/** The five-step workflow (reference build spec "Public website"). */
export const workflowSteps: WorkflowStep[] = [
  {
    title: "Brief & campaign",
    summary: "Set up a campaign and write the brief as a playbook.",
    you: "Choose a primary hashtag, format, budget and targeting, then write a playbook with scenes and references.",
    platform: "Checks the setup, keeps drafts private, and shows what each plan includes before anything goes live.",
  },
  {
    title: "Creator recruitment",
    summary: "Creators who match your targeting pick up the playbook.",
    you: "Decide who can join. On Unlimited you can require approval or dedicated accounts.",
    platform: "Offers the published playbook only to verified creators who match the campaign's targeting.",
  },
  {
    title: "Management & payment",
    summary: "Review posts, talk to creators and pay as they earn.",
    you: "Approve or reject submitted posts and message creators where your plan includes it.",
    platform: "Matches posts to the campaign by hashtag, tracks earnings, and charges in increments of your billing threshold.",
  },
  {
    title: "Paid ads",
    summary: "Run the best posts as Meta and TikTok ads.",
    you: "Connect an ad account, pick approved posts and confirm the launch.",
    platform: "Applies your naming, tracking and call-to-action defaults. Nothing launches without your confirmation.",
  },
  {
    title: "Content iteration",
    summary: "Keep what works and update the brief.",
    you: "Compare playbooks and posts, then refine scenes, hooks and references.",
    platform: "Reports organic and paid results by UTC day so changes can be compared over the same ranges.",
  },
];

export const integrations = [
  { name: "Meta", detail: "Launch approved posts as Facebook and Instagram ads." },
  { name: "TikTok", detail: "Launch approved posts as TikTok ads." },
  { name: "App Store Connect", detail: "Bring in App Store installs for app campaigns." },
  { name: "Google Play", detail: "Bring in Google Play installs for app campaigns." },
] as const;

export const creatorParticipation = [
  { title: "Verified accounts", body: "Creators connect the social accounts they post from, so every post is tied to a real, verified account." },
  { title: "Playbooks, not guesswork", body: "Each campaign comes with a playbook: what to film, what to say and which hashtags to use." },
  { title: "Reviewed before it counts", body: "Brands review submitted posts. Only approved posts are reported and can be used as ads." },
  { title: "Paid once eligible", body: "Earnings follow the campaign's terms and are paid out once they become eligible." },
] as const;

/** Start links with CTA attribution (`/start?cta=...`). */
export function startHref(cta: string): string {
  return `/start?cta=${encodeURIComponent(cta)}`;
}
