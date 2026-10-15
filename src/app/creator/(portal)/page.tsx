import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { discoverCampaigns } from "@/server/campaign-admission";
import { requireCreatorPage } from "@/server/creator/context";
import { loadEarnings, payoutReadiness, submissionCounts } from "@/server/creator/fulfillment";
import { buttonClasses } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { EarningsPanel, PayoutPanel } from "@/components/creator/earnings-panels";

export const metadata: Metadata = { title: "Creator home" };

/** Signed-in creator home: next step, campaign and submission summaries, earnings and payout readiness. */
export default async function CreatorHomePage() {
  const ctx = await requireCreatorPage("/creator");
  const [discovery, counts, earnings] = await Promise.all([discoverCampaigns(ctx), submissionCounts(ctx), loadEarnings(ctx)]);
  const joined = discovery.mine.filter((c) => c.admission === "approved").length;
  const waiting = discovery.mine.filter((c) => c.admission === "requested").length;

  return (
    <>
      <h1 className="text-xl font-semibold leading-7 text-ink">Hi, {ctx.creator.displayName}</h1>
      <p className="mt-1 text-sm text-muted">Find campaigns, follow your playbook, and submit your posts for review.</p>

      {!discovery.hasAccounts ? (
        <InlineAlert
          tone="info"
          title="Link a social account to see campaigns"
          className="mt-6"
          action={
            <Link href="/creator/profile#accounts" className={buttonClasses("primary", "sm", "max-md:h-11")}>
              Add account
            </Link>
          }
        >
          Campaigns are matched to the platforms you post on.
        </InlineAlert>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Campaigns"
            actions={
              <Link href="/creator/campaigns" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink hover:underline md:min-h-0">
                Browse <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <CardBody>
            <dl className="grid grid-cols-3 gap-3">
              <Stat label="Joined" value={joined} />
              <Stat label="Awaiting approval" value={waiting} />
              <Stat label="Open to you" value={discovery.available.length} />
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Submissions"
            actions={
              <Link href="/creator/submissions" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink hover:underline md:min-h-0">
                History <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <CardBody>
            <dl className="grid grid-cols-3 gap-3">
              <Stat label="In review" value={counts.submitted} />
              <Stat label="Approved" value={counts.approved} />
              <Stat label="Not approved" value={counts.rejected} />
            </dl>
          </CardBody>
        </Card>
        <EarningsPanel earnings={earnings} />
        <PayoutPanel readiness={payoutReadiness()} />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}
