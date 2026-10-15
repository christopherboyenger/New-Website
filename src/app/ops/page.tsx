import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { formatAge, formatUtcInstant } from "@/components/workspace/format";
import { NotConfiguredNotice } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader, PageContainer, PageHeader } from "@/components/ui/layout";
import { formatCount } from "@/lib/money";
import { earningPolicyDecisionsRequired } from "@/server/ops/earnings";
import { requireOperatorPage } from "@/server/ops/operator";
import { loadOpsOverview } from "@/server/ops/overview";

export const metadata: Metadata = { title: "Overview" };

export default async function OpsOverviewPage() {
  const operator = await requireOperatorPage();
  const now = new Date();
  const overview = await loadOpsOverview(operator, now);
  const webhookIssues = overview.webhooks.quarantined + overview.webhooks.failed;

  return (
    <PageContainer>
      <PageHeader title="Overview" description="Work waiting on operators across all workspaces. Counts are live from the database." />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        <StatCard
          label="Posts awaiting review"
          value={overview.review.submitted}
          href="/ops/review"
          linkLabel="Open review queue"
          detail={
            overview.review.oldestSubmittedAt ? (
              <span title={formatUtcInstant(overview.review.oldestSubmittedAt)}>Oldest submitted {formatAge(overview.review.oldestSubmittedAt, now)}</span>
            ) : (
              "Queue is empty"
            )
          }
        />
        <StatCard
          label="Webhooks needing attention"
          value={webhookIssues}
          href="/ops/webhooks"
          linkLabel="View webhook issues"
          detail={`${formatCount(overview.webhooks.quarantined)} quarantined · ${formatCount(overview.webhooks.failed)} failed`}
        />
        <StatCard
          label="Leads"
          value={overview.leads.total}
          href="/ops/leads"
          linkLabel="View leads"
          detail={`${formatCount(overview.leads.last7Days)} in the last 7 days`}
        />
        <StatCard label="Brand workspaces" value={overview.workspaces} detail="All organizations on this deployment" />
      </ul>

      <Card className="mt-6">
        <CardHeader title="Creator earnings" description="Earning jobs stay off until the business decides the earning policy." />
        <CardBody>
          {overview.earningsConfigured ? (
            <p className="text-sm text-ink-2">An earning policy is configured.</p>
          ) : (
            <NotConfiguredNotice title="Earning policy not configured — no earnings are calculated">
              <p>These inputs must be decided before any earning job runs:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {earningPolicyDecisionsRequired().map((decision) => (
                  <li key={decision}>{decision}</li>
                ))}
              </ul>
            </NotConfiguredNotice>
          )}
        </CardBody>
      </Card>
    </PageContainer>
  );
}

function StatCard({ label, value, detail, href, linkLabel }: { label: string; value: number; detail: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <li className="flex flex-col rounded-[12px] border border-line bg-surface p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{formatCount(value)}</p>
      <p className="mt-1 text-[13px] text-muted">{detail}</p>
      {href ? (
        <Link href={href} className="mt-3 inline-flex min-h-11 items-center gap-1 self-start text-[13px] font-medium text-ink underline-offset-4 hover:underline md:min-h-0">
          {linkLabel}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}
