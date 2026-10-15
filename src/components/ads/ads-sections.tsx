/**
 * Ads page sections (L08 All ads, L37 Submissions). Async server components:
 * each loads its own tenant-authorized data so the page can show a skeleton
 * while a new view, range or page loads.
 */
import { Plus } from "lucide-react";
import { notFound } from "next/navigation";
import type { DateRange } from "@/domain/date-range";
import { loadAdsOverview, type AdLaunchRow, type AdSubmissionRow, type AdsView } from "@/server/ads";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, NotConfiguredNotice, Skeleton } from "@/components/ui/feedback";
import { Card } from "@/components/ui/layout";
import { Pagination, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { ctaLabel } from "./cta-catalog";
import { AdAccountPrerequisite, ConnectionProblems, formatUtcDate, providerLabels, StageBadge } from "./ads-display";

export interface AdsSectionProps {
  slug: string;
  view: AdsView;
  range: DateRange;
  page: number;
  /** Builds this page's URL with a different page number (keeps view and range). */
  pageHref: (page: number) => string;
}

export async function AdsSection({ slug, view, range, page, pageHref }: AdsSectionProps) {
  const result = await loadAdsOverview(slug, { view, range, page });
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    throw new Error(result.error);
  }
  const data = result.data;
  const base = `/home/${slug}`;
  const pagination =
    data.total > data.pageSize ? (
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        prevHref={data.page > 1 ? pageHref(data.page - 1) : null}
        nextHref={data.page * data.pageSize < data.total ? pageHref(data.page + 1) : null}
      />
    ) : null;

  if (view === "submissions") {
    if (data.total === 0) {
      return (
        <Card>
          <EmptyState title="No direct submissions in this date range" description="Direct video and image submissions from creators appear here." />
        </Card>
      );
    }
    return (
      <Card className="overflow-hidden">
        <SubmissionsTable rows={data.submissions} />
        {pagination}
      </Card>
    );
  }

  if (!data.connection.connected.length) {
    return (
      <AdAccountPrerequisite
        message="Connect a Meta or TikTok ad account to run your posts as ads."
        integrationsHref={`${base}/integrations`}
        installations={data.connection.installations}
      />
    );
  }

  const connected = data.connection.installations.filter((i) => i.status === "connected");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Connected:{" "}
        {connected.map((c, i) => (
          <span key={c.provider} className="text-ink-2">
            {i > 0 ? " · " : null}
            {providerLabels[c.provider]}
            {c.accountName ? ` (${c.accountName})` : " (no ad account selected)"}
          </span>
        ))}
      </p>
      <ConnectionProblems installations={data.connection.installations} />
      <NotConfiguredNotice title="Ad performance isn't available">
        Impressions, spend and results aren&apos;t imported from Meta or TikTok on this deployment, so no performance numbers are shown.
      </NotConfiguredNotice>
      {data.total === 0 ? (
        <Card>
          <EmptyState
            title="No ads in this date range"
            description="Ad drafts you create appear here with their launch stage."
            action={
              data.canLaunch ? (
                <ButtonLink href={`${base}/ads/new?pick=1`} size="sm" className="max-md:min-h-11">
                  <Plus className="size-3.5" aria-hidden="true" />
                  Create ads
                </ButtonLink>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <LaunchesTable rows={data.launches} />
          {pagination}
        </Card>
      )}
    </div>
  );
}

function LaunchesTable({ rows }: { rows: AdLaunchRow[] }) {
  return (
    <TableScroll label="Ads">
      <Table>
        <caption className="sr-only">Ads created in the selected date range, newest first</caption>
        <THead>
          <tr>
            <TH>Ad name</TH>
            <TH>Platform</TH>
            <TH>Source</TH>
            <TH>Stage</TH>
            <TH>CTA</TH>
            <TH>Created (UTC)</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="max-w-[320px] truncate font-medium" title={r.adName}>
                {r.adName}
              </TD>
              <TD>{providerLabels[r.provider]}</TD>
              <TD>
                {r.source.kind === "post" ? (
                  <span>
                    {r.source.creatorName ?? "Unknown creator"}
                    {r.source.handle ? <span className="text-muted"> · @{r.source.handle}</span> : null}
                  </span>
                ) : (
                  <span>
                    {r.source.creatorName ?? "Unknown creator"} <span className="text-muted">· Submission</span>
                  </span>
                )}
              </TD>
              <TD>
                <StageBadge stage={r.stage} />
              </TD>
              <TD>{ctaLabel(r.provider === "meta_ads" ? "meta" : "tiktok", r.cta) ?? <span className="text-muted">None</span>}</TD>
              <TD className="text-ink-2">{formatUtcDate(r.createdAt)}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}

const submissionStatus = {
  submitted: { label: "Submitted", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
} as const;

function rightsWindow(r: AdSubmissionRow): string {
  if (!r.rightsGrantedAt) return "No rights granted";
  const from = formatUtcDate(r.rightsGrantedAt);
  if (!r.rightsExpiresAt) return `From ${from}, no expiry`;
  const expired = new Date(r.rightsExpiresAt) <= new Date();
  return `${from} – ${formatUtcDate(r.rightsExpiresAt)}${expired ? " (expired)" : ""}`;
}

function SubmissionsTable({ rows }: { rows: AdSubmissionRow[] }) {
  return (
    <TableScroll label="Direct submissions">
      <Table>
        <caption className="sr-only">Direct creator submissions received in the selected date range, newest first</caption>
        <THead>
          <tr>
            <TH>Creator</TH>
            <TH>Note</TH>
            <TH>Status</TH>
            <TH>Rights window (UTC)</TH>
            <TH>Received (UTC)</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-medium">{r.creatorName ?? "Unknown creator"}</TD>
              <TD className="max-w-[320px] truncate text-ink-2" title={r.note || undefined}>
                {r.note || <span className="text-muted">No note</span>}
                {!r.hasMedia ? <span className="ml-2 text-xs text-muted">(no media file)</span> : null}
              </TD>
              <TD>
                <Badge tone={submissionStatus[r.status].tone}>{submissionStatus[r.status].label}</Badge>
              </TD>
              <TD className="text-ink-2">{rightsWindow(r)}</TD>
              <TD className="text-ink-2">{formatUtcDate(r.createdAt)}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}

export function AdsSectionSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading ads…</span>
      <div aria-hidden="true" className="rounded-[12px] border border-line bg-surface p-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-9 w-full" />
        <Skeleton className="mt-2 h-9 w-full" />
        <Skeleton className="mt-2 h-9 w-full" />
      </div>
    </div>
  );
}
