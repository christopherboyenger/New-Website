import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { platformLabels } from "@/domain/campaign";
import { countryName } from "@/domain/targeting-catalog";
import { hasPermission, loadOrgContext, requireOrgPage } from "@/server/authz";
import { listJoinRequests } from "@/server/campaign-admission";
import { Badge, EmptyState, InlineAlert } from "@/components/ui/feedback";
import { Card } from "@/components/ui/layout";
import { Pagination, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { CreatorAvatar } from "@/components/creators/creator-avatar";
import { formatUtcDate, levelLabel } from "@/components/creators/format";
import { JoinRequestActions } from "@/components/creator/join-request-actions";
import { approveJoinRequestAction, rejectJoinRequestAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Join requests · ${ctx.org.name}` : "Join requests" };
}

/**
 * Brand-side admission queue: creators asking to join campaigns that require
 * creator approval. Owners (creator:manage) approve or decline; members see
 * why they can't. Admission is separate from post review.
 */
export default async function JoinRequestsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/creators/requests`);
  const basePath = `/home/${ctx.org.slug}/creators/requests`;
  const canManage = hasPermission(ctx, "creator:manage");

  const header = (
    <div className="mb-6">
      <Link href={`/home/${ctx.org.slug}/creators`} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink md:min-h-0">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Creators
      </Link>
      <h1 className="text-xl font-semibold leading-7 text-ink">Join requests</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Creators asking to join campaigns that require your approval. Approving lets them see the campaign&apos;s published playbooks and submit posts; each post is still reviewed separately.
      </p>
    </div>
  );

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        {header}
        <InlineAlert tone="info" title="Only workspace owners can review join requests">
          Ask an owner of {ctx.org.name} to approve or decline creators.
        </InlineAlert>
      </div>
    );
  }

  const raw = (await searchParams).page;
  const requested = Number.parseInt(Array.isArray(raw) ? raw[0] : (raw ?? "1"), 10);
  const page = await listJoinRequests(ctx, Number.isFinite(requested) ? requested : 1);
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
  const approve = approveJoinRequestAction.bind(null, ctx.org.slug);
  const reject = rejectJoinRequestAction.bind(null, ctx.org.slug);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      {header}
      <Card className="overflow-hidden">
        {page.total === 0 ? (
          <EmptyState headingLevel={2}
            title="No pending requests"
            description="When one of your campaigns requires creator approval, creators who ask to join appear here."
          />
        ) : (
          <>
            <TableScroll label="Pending join requests">
              <Table>
                <THead>
                  <tr>
                    <TH>Creator</TH>
                    <TH>Accounts</TH>
                    <TH>Campaign</TH>
                    <TH>Requested</TH>
                    <TH className="text-right">
                      <span className="sr-only">Decision</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {page.rows.map((row) => (
                    <TR key={`${row.campaignId}:${row.creatorId}`} className="align-top">
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <CreatorAvatar name={row.creatorName} />
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{row.creatorName}</p>
                            <p className="text-xs text-muted">
                              {levelLabel(row.level)}
                              {row.country ? ` · ${countryName(row.country)}` : ""}
                            </p>
                          </div>
                          {row.removed ? <Badge tone="warning">Removed</Badge> : null}
                        </div>
                      </TD>
                      <TD>
                        {row.accounts.length === 0 ? (
                          <span className="text-muted">No linked accounts</span>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {row.accounts.map((a) => (
                              <li key={`${a.platform}:${a.handle}`} className="flex items-center gap-1.5">
                                <span className="text-ink-2">
                                  {platformLabels[a.platform]} <span className="text-ink">@{a.handle}</span>
                                </span>
                                {a.verification === "verified" ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>}
                                {a.dedicated ? <Badge tone="info">Dedicated</Badge> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TD>
                      <TD>{row.campaignName}</TD>
                      <TD className="text-ink-2">
                        <time dateTime={row.requestedAt}>{formatUtcDate(row.requestedAt)}</time>
                      </TD>
                      <TD className="text-right">
                        <JoinRequestActions
                          campaignId={row.campaignId}
                          creatorId={row.creatorId}
                          creatorName={row.creatorName}
                          campaignName={row.campaignName}
                          removed={row.removed}
                          approveAction={approve}
                          rejectAction={reject}
                        />
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
                prevHref={page.page > 1 ? `${basePath}?page=${page.page - 1}` : null}
                nextHref={page.page < lastPage ? `${basePath}?page=${page.page + 1}` : null}
              />
            </div>
          </>
        )}
      </Card>
      <p className="mt-3 text-[13px] text-muted">Account ownership is shown as unverified until the creator connects the platform; handles are self-reported.</p>
    </div>
  );
}
