import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { platformLabels } from "@/domain/campaign";
import { requireCreatorPage } from "@/server/creator/context";
import { listSubmissions, loadEarnings, payoutReadiness } from "@/server/creator/fulfillment";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/layout";
import { Pagination, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { formatUtcDate } from "@/components/creators/format";
import { EarningsPanel, PayoutPanel } from "@/components/creator/earnings-panels";
import { ReviewBadge } from "@/components/creator/status-badges";

export const metadata: Metadata = { title: "Submissions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The signed-in creator's submitted posts with review status and reasons, plus earnings and payout readiness. */
export default async function CreatorSubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCreatorPage("/creator/submissions");
  const raw = (await searchParams).page;
  const requested = Number.parseInt(Array.isArray(raw) ? raw[0] : (raw ?? "1"), 10);
  const [page, earnings] = await Promise.all([listSubmissions(ctx, Number.isFinite(requested) ? requested : 1), loadEarnings(ctx)]);
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <>
      <h1 className="text-xl font-semibold leading-7 text-ink">Submissions</h1>
      <p className="mt-1 text-sm text-muted">Every post you&apos;ve submitted and where its review stands.</p>

      <Card className="mt-6 overflow-hidden">
        {page.total === 0 ? (
          <EmptyState headingLevel={2}
            title="No submissions yet"
            description="Join a campaign, follow its playbook, post on your account, then submit the link from the playbook page."
            action={
              <Link href="/creator/campaigns" className={buttonClasses("primary", "md", "max-md:h-11")}>
                Find campaigns
              </Link>
            }
          />
        ) : (
          <>
            <TableScroll label="Submitted posts">
              <Table>
                <THead>
                  <tr>
                    <TH>Post</TH>
                    <TH>Campaign</TH>
                    <TH>Submitted</TH>
                    <TH>Review</TH>
                    <TH>Paid-ad rights</TH>
                  </tr>
                </THead>
                <tbody>
                  {page.rows.map((row) => (
                    <TR key={row.id} className="align-top">
                      <TD>
                        <a href={row.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink hover:underline md:min-h-0">
                          {platformLabels[row.platform]} · @{row.handle}
                          <ExternalLink className="size-3.5 text-muted" aria-hidden="true" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </TD>
                      <TD>
                        <p className="text-ink">{row.campaignName ?? "Campaign no longer available"}</p>
                        <p className="text-xs text-muted">
                          {row.brandName}
                          {row.playbookName ? ` · ${row.playbookName}` : ""}
                          {row.playbookRevision !== null ? ` (version ${row.playbookRevision})` : ""}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap text-ink-2">
                        <time dateTime={row.submittedAt}>{formatUtcDate(row.submittedAt)}</time>
                      </TD>
                      <TD>
                        <ReviewBadge status={row.reviewStatus} />
                        {row.reviewStatus === "rejected" ? (
                          <p className="mt-1 max-w-72 whitespace-normal text-xs text-ink-2">{row.reviewReason ? `Reason: ${row.reviewReason}` : "No reason was recorded."}</p>
                        ) : null}
                        {row.reviewedAt ? (
                          <p className="mt-1 text-xs text-muted">
                            Reviewed <time dateTime={row.reviewedAt}>{formatUtcDate(row.reviewedAt)}</time>
                          </p>
                        ) : null}
                      </TD>
                      <TD className="text-ink-2">
                        {!row.adRights ? (
                          <span className="text-muted">Not granted</span>
                        ) : row.adRights.revoked ? (
                          "Withdrawn"
                        ) : row.adRights.expiresAt ? (
                          <>
                            Granted
                            <span className="block text-xs text-muted">
                              until <time dateTime={row.adRights.expiresAt}>{formatUtcDate(row.adRights.expiresAt)}</time>
                            </span>
                          </>
                        ) : (
                          "Granted"
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
            <div className="border-t border-line">
              <Pagination
                page={page.page}
                pageSize={page.pageSize}
                total={page.total}
                prevHref={page.page > 1 ? `/creator/submissions?page=${page.page - 1}` : null}
                nextHref={page.page < lastPage ? `/creator/submissions?page=${page.page + 1}` : null}
              />
            </div>
          </>
        )}
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <EarningsPanel earnings={earnings} />
        <PayoutPanel readiness={payoutReadiness()} />
      </div>
    </>
  );
}
