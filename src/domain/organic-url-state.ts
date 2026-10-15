/**
 * Organic reporting URL state (evidence audit item 8: "Build URL state and
 * local UI state as separate contracts"). Everything that changes what the
 * Organic page shows is deep-linkable, so reload and Back/Forward restore it.
 *
 * Observed keys: `tab`, `campaign`, `from`, `to`, `comparisons` (L02–L04).
 * Proposed keys (docs/decisions/reporting.md): `playbook`, `platform`,
 * `review`, `view`, `mode`, `metrics`, `chart`, `sort`, `order`, `page`, `q`.
 *
 * Parsing is lenient (malformed or unknown values fall back to defaults and
 * never throw); serialization is canonical (fixed key order, defaults omitted,
 * dates always present so a shared link shows the same range).
 * Pure and framework-free: used by the server page and by client controls.
 */
import { platforms, type Platform } from "./campaign";
import { normalizeRange, type DateRange } from "./date-range";

export const organicTabs = ["campaigns", "playbooks", "posts"] as const;
export type OrganicTab = (typeof organicTabs)[number];
export const DEFAULT_TAB: OrganicTab = "posts";

export const organicTabLabels: Record<OrganicTab, string> = {
  campaigns: "Campaigns",
  playbooks: "Playbooks",
  posts: "Posts",
};

export const comparisonDimensions = ["none", "campaign", "playbook", "platform"] as const;
export type ComparisonDimension = (typeof comparisonDimensions)[number];

export const comparisonLabels: Record<ComparisonDimension, string> = {
  none: "None",
  campaign: "Campaign",
  playbook: "Playbook",
  platform: "Platform",
};

export const postLayouts = ["grid", "table"] as const;
export type PostLayout = (typeof postLayouts)[number];

export const postModes = ["created", "active"] as const;
export type PostMode = (typeof postModes)[number];

export const postModeLabels: Record<PostMode, { label: string; description: string }> = {
  created: {
    label: "Created in range",
    description: "Posts that were created in your selected date range",
  },
  active: {
    label: "Active in range",
    description: "Posts that accumulated views in your selected date range",
  },
};

/** Review-status filter for the post list (the brand UI lists all three by default). */
export const reviewFilters = ["submitted", "approved", "rejected"] as const;
export type ReviewFilter = (typeof reviewFilters)[number];

export const reviewFilterLabels: Record<ReviewFilter, string> = {
  submitted: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

/* ----------------------------------------------------------------------------
 * Metrics (L33)
 * ------------------------------------------------------------------------- */

export const organicMetrics = ["views", "spend", "cpm", "posts", "creators", "likes", "comments", "bookmarks", "shares", "engagement"] as const;
export type OrganicMetric = (typeof organicMetrics)[number];

export const organicMetricLabels: Record<OrganicMetric, string> = {
  views: "Total Views",
  spend: "Spend",
  cpm: "CPM",
  posts: "Posts",
  creators: "Creators",
  likes: "Likes",
  comments: "Comments",
  bookmarks: "Bookmarks",
  shares: "Shares",
  engagement: "Engagement %",
};

/** Metrics earned within the date range: they have a daily (UTC) series. */
export const rangeMetrics = ["views", "spend", "cpm", "posts", "creators"] as const satisfies readonly OrganicMetric[];
export type RangeMetric = (typeof rangeMetrics)[number];

/** Lifetime post counters: no daily series exists, only per-post lifetime totals. */
export const lifetimeMetrics = ["likes", "comments", "bookmarks", "shares", "engagement"] as const satisfies readonly OrganicMetric[];
export type LifetimeMetric = (typeof lifetimeMetrics)[number];

export function isRangeMetric(metric: OrganicMetric): metric is RangeMetric {
  return (rangeMetrics as readonly string[]).includes(metric);
}

export const METRIC_SLOTS = 4;
/** Observed default cards: Total Views, Spend, CPM, Posts (L02). */
export const DEFAULT_METRICS: readonly OrganicMetric[] = ["views", "spend", "cpm", "posts"];

/* ----------------------------------------------------------------------------
 * Sorting
 * ------------------------------------------------------------------------- */

export const campaignSorts = ["active", "name", "views", "spend", "cpm", "playbooks", "posts", "creators", "avg_views"] as const;
export type CampaignSort = (typeof campaignSorts)[number];

export const playbookSorts = ["active", "name", "views", "spend", "cpm", "posts", "creators", "avg_views"] as const;
export type PlaybookSort = (typeof playbookSorts)[number];

/** Mirrors the post drilldown's documented sort keys (src/server/reporting.ts `postSorts`). */
export const postSortKeys = ["posted", "views", "range_views", "likes", "comments", "bookmarks", "shares", "spend", "engagement", "handle"] as const;
export type PostSortKey = (typeof postSortKeys)[number];

export type SortOrder = "asc" | "desc";

const sortsByTab: Record<OrganicTab, readonly string[]> = {
  campaigns: campaignSorts,
  playbooks: playbookSorts,
  posts: postSortKeys,
};

export const defaultSortByTab: Record<OrganicTab, string> = {
  campaigns: "views",
  playbooks: "views",
  posts: "posted",
};

/** Text columns read naturally A→Z; every numeric/date column starts highest-first (DEC-011 default `desc`). */
export function defaultOrderFor(sort: string): SortOrder {
  return sort === "name" || sort === "handle" ? "asc" : "desc";
}

export function sortsForTab(tab: OrganicTab): readonly string[] {
  return sortsByTab[tab];
}

/* ----------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------- */

export interface OrganicState {
  tab: OrganicTab;
  /** Campaign filter: an ID, or "0" for unattributed posts (reporting sentinel). */
  campaign: string | null;
  /** Playbook filter: an ID, or "0" for Custom Posts (reporting sentinel). */
  playbook: string | null;
  platform: Platform | null;
  review: ReviewFilter | null;
  range: DateRange;
  comparisons: ComparisonDimension;
  view: PostLayout;
  mode: PostMode;
  /** Exactly METRIC_SLOTS distinct metrics, one per card. */
  metrics: OrganicMetric[];
  /** The card whose daily series is charted; always one of `metrics`. */
  chart: OrganicMetric;
  /** Valid for `tab` (see sortsForTab). */
  sort: string;
  order: SortOrder;
  page: number;
  q: string;
}

export const MAX_PAGE = 10_000;
export const MAX_QUERY_LENGTH = 100;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function reader(input: SearchParamsInput): (key: string) => string | undefined {
  if (input instanceof URLSearchParams) return (key) => input.get(key) ?? undefined;
  return (key) => {
    const value = input[key];
    return Array.isArray(value) ? value[0] : value;
  };
}

function oneOf<T extends string>(list: readonly T[], value: string | undefined, fallback: T): T {
  return value !== undefined && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseId(value: string | undefined): string | null {
  const v = value?.trim();
  return v && ID_RE.test(v) ? v : null;
}

/** Up to METRIC_SLOTS distinct known metrics from a comma list, padded with defaults so there are always four cards. */
export function parseMetrics(value: string | undefined): OrganicMetric[] {
  const chosen: OrganicMetric[] = [];
  for (const part of (value ?? "").split(",")) {
    const key = part.trim() as OrganicMetric;
    if ((organicMetrics as readonly string[]).includes(key) && !chosen.includes(key)) chosen.push(key);
    if (chosen.length === METRIC_SLOTS) break;
  }
  for (const fallback of [...DEFAULT_METRICS, ...organicMetrics]) {
    if (chosen.length === METRIC_SLOTS) break;
    if (!chosen.includes(fallback)) chosen.push(fallback);
  }
  return chosen;
}

function parsePage(value: string | undefined): number {
  if (!value || !/^\d{1,6}$/.test(value)) return 1;
  const n = Number(value);
  return n >= 1 && n <= MAX_PAGE ? n : 1;
}

function parseQuery(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export function parseOrganicState(input: SearchParamsInput, now: Date = new Date()): OrganicState {
  const get = reader(input);
  const tab = oneOf(organicTabs, get("tab"), DEFAULT_TAB);
  const metrics = parseMetrics(get("metrics"));
  const chartRaw = get("chart");
  const chart = chartRaw && (metrics as string[]).includes(chartRaw) ? (chartRaw as OrganicMetric) : metrics[0];
  const sortRaw = get("sort");
  const sort = sortRaw && sortsByTab[tab].includes(sortRaw) ? sortRaw : defaultSortByTab[tab];
  const orderRaw = get("order");
  const order: SortOrder = orderRaw === "asc" || orderRaw === "desc" ? orderRaw : defaultOrderFor(sort);
  return {
    tab,
    campaign: parseId(get("campaign")),
    playbook: parseId(get("playbook")),
    platform: oneOf<Platform | "">([...platforms, ""], get("platform"), "") || null,
    review: oneOf<ReviewFilter | "">([...reviewFilters, ""], get("review"), "") || null,
    range: normalizeRange(get("from"), get("to"), now),
    comparisons: oneOf(comparisonDimensions, get("comparisons"), "none"),
    view: oneOf(postLayouts, get("view"), "grid"),
    mode: oneOf(postModes, get("mode"), "created"),
    metrics,
    chart,
    sort,
    order,
    page: parsePage(get("page")),
    // `search` is accepted as an alias (global search links use it); `q` is canonical.
    q: parseQuery(get("q") ?? get("search")),
  };
}

function sameMetrics(a: readonly OrganicMetric[], b: readonly OrganicMetric[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

/** Canonical query string: fixed key order, defaults omitted, dates always present. */
export function serializeOrganicState(state: OrganicState): URLSearchParams {
  const out = new URLSearchParams();
  if (state.tab !== DEFAULT_TAB) out.set("tab", state.tab);
  if (state.campaign) out.set("campaign", state.campaign);
  if (state.playbook) out.set("playbook", state.playbook);
  if (state.platform) out.set("platform", state.platform);
  if (state.review) out.set("review", state.review);
  out.set("from", state.range.from);
  out.set("to", state.range.to);
  if (state.comparisons !== "none") out.set("comparisons", state.comparisons);
  if (state.view !== "grid") out.set("view", state.view);
  if (state.mode !== "created") out.set("mode", state.mode);
  if (!sameMetrics(state.metrics, DEFAULT_METRICS)) out.set("metrics", state.metrics.join(","));
  if (state.chart !== state.metrics[0]) out.set("chart", state.chart);
  if (state.sort !== defaultSortByTab[state.tab]) out.set("sort", state.sort);
  if (state.order !== defaultOrderFor(state.sort)) out.set("order", state.order);
  if (state.page > 1) out.set("page", String(state.page));
  if (state.q) out.set("q", state.q);
  return out;
}

/**
 * Applies a change to the state with the page's navigation rules:
 * - every change returns to page 1 unless the patch sets `page`;
 * - changing tab resets sorting to that tab's default;
 * - changing the sort key without an order uses that key's default order;
 * - changing the metric cards keeps the charted metric if it is still shown.
 */
export function applyOrganicPatch(state: OrganicState, patch: Partial<OrganicState>): OrganicState {
  const next: OrganicState = { ...state, ...patch };
  if (!("page" in patch)) next.page = 1;
  if (patch.tab && patch.tab !== state.tab && !("sort" in patch)) {
    next.sort = defaultSortByTab[patch.tab];
    next.order = defaultOrderFor(next.sort);
  } else if ("sort" in patch && !("order" in patch)) {
    next.order = defaultOrderFor(next.sort);
  }
  if (!sortsByTab[next.tab].includes(next.sort)) {
    next.sort = defaultSortByTab[next.tab];
    next.order = defaultOrderFor(next.sort);
  }
  if (patch.metrics) {
    next.metrics = parseMetrics(patch.metrics.join(","));
    if (!("chart" in patch) || !next.metrics.includes(next.chart)) {
      next.chart = next.metrics.includes(state.chart) ? state.chart : next.metrics[0];
    }
  }
  if (!next.metrics.includes(next.chart)) next.chart = next.metrics[0];
  return next;
}

/** `${basePath}?<canonical query>` after applying `patch` (see applyOrganicPatch). */
export function organicHref(basePath: string, state: OrganicState, patch: Partial<OrganicState> = {}): string {
  const query = serializeOrganicState(applyOrganicPatch(state, patch)).toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Header-click sorting: the active column flips its order; another column starts at its default order. */
export function sortPatch(state: OrganicState, sort: string): Partial<OrganicState> {
  if (state.sort === sort) return { sort, order: state.order === "asc" ? "desc" : "asc" };
  return { sort, order: defaultOrderFor(sort) };
}

/** Whether any post-list filter (beyond the date range and mode) narrows the results. */
export function hasPostFilters(state: OrganicState): boolean {
  return Boolean(state.campaign || state.playbook || state.platform || state.review || state.q);
}
