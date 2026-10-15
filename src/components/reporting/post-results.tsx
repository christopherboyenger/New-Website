import { ExternalLink, Film } from "lucide-react";
import { platformLabels } from "@/domain/campaign";
import type { PostSortKey } from "@/domain/organic-url-state";
import { formatPercent } from "@/domain/reporting-math";
import { formatUsd } from "@/lib/money";
import { Badge, type Tone } from "@/components/ui/feedback";
import { SortHeader, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import type { PostRow } from "@/server/reporting";
import type { SortLink } from "./columns";
import { EM_DASH, formatCount } from "./format";
import { LocalDateTime } from "./local-time";

const reviewBadge: Record<PostRow["review_status"], { label: string; tone: Tone }> = {
  approved: { label: "Approved", tone: "success" },
  submitted: { label: "In review", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
};

const lifetime = (value: number | null) => (value === null ? EM_DASH : formatCount(value));
const spendUsd = (usd: number) => formatUsd(Math.round(usd * 100), { decimals: 2 });

function playbookLabel(post: PostRow): string {
  if (post.playbook_id === "0") return "Custom post";
  return post.playbook_name ?? "Unknown playbook";
}

/** Neutral thumbnail placeholder: no invented imagery, just the platform name. */
function Thumbnail({ post }: { post: PostRow }) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-t-[12px] bg-selected">
      {post.image ? (
        // Provider thumbnails come from arbitrary hosts; a plain <img> avoids proxying them through the app.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image} alt={`Thumbnail of @${post.handle}'s post`} loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted">
          <Film className="size-6" aria-hidden="true" />
          <span className="text-xs">No thumbnail</span>
        </div>
      )}
      <span className="absolute left-2 top-2">
        <Badge tone={reviewBadge[post.review_status].tone} className="shadow-sm">
          {reviewBadge[post.review_status].label}
        </Badge>
      </span>
    </div>
  );
}

/** Grid layout (proposed: no populated post card was observed in the reference). */
export function PostGrid({ posts }: { posts: PostRow[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Posts">
      {posts.map((post) => (
        <li key={post.content_id}>
          <article className="flex h-full flex-col rounded-[12px] border border-line bg-surface" aria-label={`@${post.handle} on ${platformLabels[post.platform]}`}>
            <Thumbnail post={post} />
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="min-w-0">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-ink hover:underline"
                  aria-label={`@${post.handle} — open post on ${platformLabels[post.platform]} (new tab)`}
                >
                  <span className="truncate">@{post.handle}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted" aria-hidden="true" />
                </a>
                <p className="truncate text-xs text-muted">
                  {platformLabels[post.platform]}
                  {post.posted_at ? (
                    <>
                      {" · "}
                      <LocalDateTime iso={post.posted_at} />
                    </>
                  ) : null}
                </p>
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <div>
                  <dt className="text-muted">Views in range</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink">{formatCount(post.range_views)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Lifetime views</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink">{lifetime(post.views)}</dd>
                </div>
              </dl>
              <p className="truncate text-xs text-muted">{playbookLabel(post)}</p>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

/** Table layout with server-side sorting on every documented post sort key. */
export function PostTable({ posts, sortLinks }: { posts: PostRow[]; sortLinks: Record<PostSortKey, SortLink> }) {
  const header = (key: PostSortKey, right = true) => <SortHeader {...sortLinks[key]} className={right ? "text-right" : undefined} />;
  return (
    <TableScroll label="Posts">
      <Table className="min-w-[1180px]">
        <THead>
          <tr>
            {header("handle", false)}
            {header("posted", false)}
            <TH>Review</TH>
            {header("range_views")}
            {header("views")}
            {header("likes")}
            {header("comments")}
            {header("bookmarks")}
            {header("shares")}
            {header("engagement")}
            {header("spend")}
            <TH>Playbook</TH>
          </tr>
        </THead>
        <tbody>
          {posts.map((post) => (
            <TR key={post.content_id}>
              <TD>
                <a href={post.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:underline" aria-label={`@${post.handle} — open post (new tab)`}>
                  @{post.handle}
                  <ExternalLink className="size-3 text-muted" aria-hidden="true" />
                </a>
                <span className="block text-xs text-muted">{platformLabels[post.platform]}</span>
              </TD>
              <TD className="text-[13px] text-ink-2">{post.posted_at ? <LocalDateTime iso={post.posted_at} /> : EM_DASH}</TD>
              <TD>
                <Badge tone={reviewBadge[post.review_status].tone}>{reviewBadge[post.review_status].label}</Badge>
              </TD>
              <TD className="text-right tabular-nums">{formatCount(post.range_views)}</TD>
              <TD className="text-right tabular-nums">{lifetime(post.views)}</TD>
              <TD className="text-right tabular-nums">{lifetime(post.likes)}</TD>
              <TD className="text-right tabular-nums">{lifetime(post.comments)}</TD>
              <TD className="text-right tabular-nums">{lifetime(post.bookmarks)}</TD>
              <TD className="text-right tabular-nums">{lifetime(post.shares)}</TD>
              <TD className="text-right tabular-nums">{formatPercent(post.engagement_rate, 2)}</TD>
              <TD className="text-right tabular-nums">{spendUsd(post.spend)}</TD>
              <TD className="max-w-[200px] truncate text-[13px] text-ink-2">{playbookLabel(post)}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}
