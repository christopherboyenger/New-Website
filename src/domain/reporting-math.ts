/**
 * Metric semantics (docs/spec/reference-build-specification.md §2 "Metric
 * semantics"): CPM is always recomputed from aggregate spend and views (never
 * an average of row CPMs); engagement is a 0–1 fraction (×100 only for
 * display); unique creators are deduplicated across the range, never summed.
 * `null` means "not computable" (e.g. zero views) and renders as an em dash.
 */

/** USD per 1,000 views, from integer cents. */
export function cpmUsd(spendCents: number, views: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null;
  return spendCents / 100 / views * 1000;
}

export interface EngagementCounts {
  likes: number | null;
  comments: number | null;
  bookmarks: number | null;
  shares: number | null;
  views: number | null;
}

/** Lifetime interactions ÷ lifetime views, as a 0–1 fraction. */
export function engagementRate(c: EngagementCounts): number | null {
  if (c.views === null || c.views <= 0) return null;
  if (c.likes === null && c.comments === null && c.bookmarks === null && c.shares === null) return null;
  const interactions = (c.likes ?? 0) + (c.comments ?? 0) + (c.bookmarks ?? 0) + (c.shares ?? 0);
  return interactions / c.views;
}

export function averageViewsPerPost(views: number, posts: number): number | null {
  return posts > 0 ? views / posts : null;
}

export interface MetricRow {
  views: number;
  spendCents: number;
  postId: string;
  creatorId: string;
}

export interface AggregateMetrics {
  views: number;
  spendCents: number;
  cpmUsd: number | null;
  posts: number;
  creators: number;
  avgViewsPerPost: number | null;
}

/** Aggregates daily/post rows into period totals with weighted CPM and deduplicated posts/creators. */
export function aggregateMetrics(rows: Iterable<MetricRow>): AggregateMetrics {
  let views = 0;
  let spendCents = 0;
  const postIds = new Set<string>();
  const creatorIds = new Set<string>();
  for (const r of rows) {
    views += r.views;
    spendCents += r.spendCents;
    postIds.add(r.postId);
    creatorIds.add(r.creatorId);
  }
  return {
    views,
    spendCents,
    cpmUsd: cpmUsd(spendCents, views),
    posts: postIds.size,
    creators: creatorIds.size,
    avgViewsPerPost: averageViewsPerPost(views, postIds.size),
  };
}

export function formatCpm(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

export function formatPercent(fraction: number | null, digits = 1): string {
  return fraction === null ? "—" : `${(fraction * 100).toFixed(digits)}%`;
}

/**
 * Delta between cumulative counter observations with correction handling: a
 * decreasing counter (platform correction) yields 0 for that interval rather
 * than a negative or double count.
 */
export function counterDelta(previous: number | null, current: number): number {
  if (previous === null) return 0;
  return Math.max(0, current - previous);
}
