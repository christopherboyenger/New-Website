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
    body: "Set your ad naming, tracking and call-to-action defaults and prepare launch drafts from approved posts with paid-use rights. Launching to Meta and TikTok is coming soon.",
    points: ["Ad naming templates and tracking parameters", "Default calls to action per platform", "Launch drafts only use posts with paid-use rights"],
  },
  {
    id: "ai-agent",
    label: "AI agent",
    title: "Ask your reporting in plain language (coming soon)",
    body: "We are building an MCP connection so AI assistants can read your campaigns, playbooks and posts. Until then, the reporting API gives scripts and tools the same data you see in the dashboard.",
    points: ["Planned: read-only access you grant and can revoke", "Available now: token-based reporting API", "Planned: support for MCP-compatible assistants"],
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
    you: "Decide who joins, follow every submitted post and its review result, and message your team.",
    platform: "Reviews submissions against the campaign's requirements and bills in increments of your billing threshold once charging is enabled.",
  },
  {
    title: "Paid ads",
    summary: "Prepare the best posts as Meta and TikTok ads (launching is coming soon).",
    you: "Connect an ad account and prepare launch drafts from approved posts.",
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
  { name: "Meta", detail: "Connect an ad account and prepare Facebook and Instagram ad drafts." },
  { name: "TikTok", detail: "Connect an advertiser account and prepare TikTok ad drafts." },
  { name: "App Store Connect", detail: "Bring in App Store installs for app campaigns." },
  { name: "Google Play", detail: "Bring in Google Play installs for app campaigns." },
] as const;

export const creatorParticipation = [
  { title: "Your own accounts", body: "Creators link the social accounts they post from, and each submission is tied to one of those accounts. Automatic ownership verification is coming soon." },
  { title: "Playbooks, not guesswork", body: "Each campaign comes with a playbook: what to film, what to say and which hashtags to use." },
  { title: "Reviewed before it counts", body: "Every submitted post is reviewed against the campaign's requirements. Only approved posts are reported, and only posts with paid-use rights can become ads." },
  { title: "Payouts (coming soon)", body: "Earnings will follow the campaign's terms. Creator payouts are not live yet; your dashboard shows exactly what is and isn't available." },
] as const;

/** Start links with CTA attribution (`/start?cta=...`). */
export function startHref(cta: string): string {
  return `/start?cta=${encodeURIComponent(cta)}`;
}
