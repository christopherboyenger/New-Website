import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { paymentSetupDisclosure } from "@/config/commercial-policy";
import { normalizeRange } from "@/domain/date-range";
import { formatUsd } from "@/lib/money";
import { hasPermission, loadOrgContext, requireOrgPage } from "@/server/authz";
import { loadBillingOverview, type BillingOverview } from "@/server/billing/overview";
import { formatBusinessAddress, type ActivityTab } from "@/server/billing/rules";
import { ActivityTable } from "@/components/billing/activity-table";
import { BusinessInfoDialog } from "@/components/billing/business-info-dialog";
import { MoneyFigure } from "@/components/billing/money-figure";
import { PaymentMethodPanel } from "@/components/billing/payment-method-panel";
import { PaymentSetupButton } from "@/components/billing/payment-setup-button";
import { ManagePlanButton, UpgradeButton } from "@/components/billing/plan-actions";
import { ThresholdEditor } from "@/components/billing/threshold-editor";
import { DateRangePicker } from "@/components/date-range/date-range-picker";
import { Badge, EmptyState, InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader, PageContainer, PageHeader } from "@/components/ui/layout";
import { LinkTabs } from "@/components/ui/tabs";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Billing · ${ctx.org.name}` : "Billing" };
}

/**
 * Billing (L13). Owner-only (`billing:view`); members get an explanation and
 * no billing data. Plan, ledger-derived balance, charge threshold, payment
 * method (provider-confirmed status only), business information and ledger
 * activity by UTC date range. Money actions go to provider-hosted pages and
 * say plainly when payments are not configured.
 */
export default async function BillingPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/billing`);

  if (!hasPermission(ctx, "billing:view")) {
    return (
      <PageContainer width="medium">
        <PageHeader title="Billing" />
        <Card>
          <EmptyState
            icon={<Lock className="size-8" aria-hidden="true" />}
            title="Billing is visible to workspace owners only"
            description="Plan, payment method, charges and business details are managed by the owners of this workspace. Ask an owner if something needs to change."
          />
        </Card>
      </PageContainer>
    );
  }

  const sp = await searchParams;
  const tab: ActivityTab = first(sp.tab) === "credits" ? "credits" : "payments";
  const range = normalizeRange(first(sp.from), first(sp.to));
  const pageNumber = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);
  const overview = await loadBillingOverview(ctx, { tab, range, page: pageNumber });
  const base = `/home/${ctx.org.slug}/billing`;

  const query = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams({ from: range.from, to: range.to, tab });
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `${base}?${params.toString()}`;
  };

  const paymentsReady = overview.readiness.payments.configured;
  const canAddCard = overview.canManage && paymentsReady;
  const needsCard = overview.payment.status === "none" || overview.payment.status === "failed" || overview.payment.status === "requires_action";

  return (
    <PageContainer width="medium">
      <PageHeader title="Billing" />

      <ReturnNotice overview={overview} setup={first(sp.setup)} upgrade={first(sp.upgrade)} />

      {!paymentsReady ? (
        <NotConfiguredNotice title="Card payments aren’t configured on this deployment" className="mb-4">
          {overview.readiness.payments.detail} Adding a card, upgrading and charges are unavailable until the payment provider is set up. Nothing on this page will
          charge you.
        </NotConfiguredNotice>
      ) : !overview.readiness.webhooks.configured ? (
        <InlineAlert tone="warning" className="mb-4" title="Payment confirmations are delayed">
          {overview.readiness.webhooks.detail} Use “Check again” after adding a card.
        </InlineAlert>
      ) : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">{overview.plan.name}</span>
            <Badge tone={overview.plan.id === "unlimited" ? "accent" : "neutral"}>Current plan</Badge>
            {overview.plan.endsAtPeriodEnd ? <Badge tone="warning">Ends at period end</Badge> : null}
          </div>
          <PlanAction overview={overview} slug={ctx.org.slug} />
        </div>
        <div className={overview.matchingCreditRemainingCents !== null ? "grid grid-cols-1 sm:grid-cols-2" : ""}>
          <div className="px-5 py-4">
            <p className="text-[13px] text-muted">
              Balance <span aria-hidden="true">•</span> Will be charged when balance reaches {formatUsd(overview.thresholdCents, { decimals: 2 })}
            </p>
            <MoneyFigure cents={overview.balanceCents} className="mt-1" />
            <p className="text-[13px] text-muted">Current balance — campaign spend not yet charged</p>
          </div>
          {overview.matchingCreditRemainingCents !== null ? (
            <div className="border-t border-line px-5 py-4 sm:border-l sm:border-t-0">
              <p className="text-[13px] text-muted">Matching credits remaining</p>
              <MoneyFigure cents={overview.matchingCreditRemainingCents} className="mt-1" />
            </div>
          ) : null}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Payment information" description="How and when your card is charged." />
          <CardBody className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-[13px] font-medium text-ink-2">Payment threshold</p>
              <ThresholdEditor slug={ctx.org.slug} thresholdCents={overview.thresholdCents} version={overview.settingsVersion} canManage={overview.canManage} />
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-[13px] font-medium text-ink-2">Payment method</p>
              {paymentsReady || overview.payment.status !== "none" ? (
                <PaymentMethodPanel slug={ctx.org.slug} payment={overview.payment} canManage={canAddCard} />
              ) : (
                <p className="text-sm text-muted">No payment method on file. Cards can be added once payments are configured.</p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Business information" description="Shown on your receipts." />
          <CardBody className="flex flex-col gap-3">
            <BusinessSummary overview={overview} />
            {overview.canManage ? (
              <div>
                <BusinessInfoDialog
                  slug={ctx.org.slug}
                  info={overview.business.info}
                  revision={overview.business.revision}
                  hasInfo={Boolean(overview.business.info.businessName)}
                />
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="billing-activity-title">
        <h2 id="billing-activity-title" className="sr-only">
          Billing activity
        </h2>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <LinkTabs
            label="Billing activity"
            activeKey={tab}
            className="min-w-0 sm:flex-1"
            tabs={[
              { key: "payments", label: "Payment activity", href: query({ tab: "payments", page: null }) },
              { key: "credits", label: "Credits", href: query({ tab: "credits", page: null }) },
            ]}
          />
          <DateRangePicker value={range} />
        </div>
        <Card>
          <ActivityTable
            tab={tab}
            page={overview.activity}
            hrefForPage={(p) => query({ page: String(p) })}
            emptyAction={
              tab === "payments" && needsCard ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <h3 className="text-[15px] font-semibold text-ink">Set up billing</h3>
                  <p className="max-w-md text-sm text-muted">{paymentSetupDisclosure()}</p>
                  {canAddCard ? (
                    <div className="mt-2">
                      <PaymentSetupButton slug={ctx.org.slug} label="Add a payment method" />
                    </div>
                  ) : !paymentsReady ? (
                    <p className="mt-1 text-[13px] text-muted">Card payments aren’t configured on this deployment yet.</p>
                  ) : null}
                </div>
              ) : undefined
            }
          />
        </Card>
      </section>
    </PageContainer>
  );
}

function PlanAction({ overview, slug }: { overview: BillingOverview; slug: string }) {
  if (!overview.canManage) return null;
  if (overview.plan.id === "unlimited") {
    return overview.plan.hasManagedSubscription && overview.readiness.payments.configured ? <ManagePlanButton slug={slug} /> : null;
  }
  if (!overview.readiness.upgrade.configured) {
    return <p className="text-[13px] text-muted">Upgrades aren’t configured on this deployment yet.</p>;
  }
  return <UpgradeButton slug={slug} />;
}

function BusinessSummary({ overview }: { overview: BillingOverview }) {
  const { info } = overview.business;
  if (!info.businessName) return <p className="text-sm text-muted">No business information yet.</p>;
  const address = formatBusinessAddress(info.address);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted">Name</dt>
      <dd className="min-w-0 break-words text-ink">{info.businessName}</dd>
      <dt className="text-muted">Address</dt>
      <dd className="min-w-0 break-words text-ink">{address || <span className="text-muted">Not provided</span>}</dd>
      <dt className="text-muted">Tax ID</dt>
      <dd className="min-w-0 break-words text-ink">{info.taxId || <span className="text-muted">Not provided</span>}</dd>
    </dl>
  );
}

/** Messages after returning from a hosted page. They describe stored provider-confirmed state only. */
function ReturnNotice({ overview, setup, upgrade }: { overview: BillingOverview; setup?: string; upgrade?: string }) {
  if (setup === "returned" && overview.payment.status === "pending") {
    return (
      <InlineAlert tone="info" className="mb-4" title="Thanks — we’re confirming your card">
        It will show under Payment method once the payment provider confirms it. Nothing has been charged.
      </InlineAlert>
    );
  }
  if (setup === "canceled" && overview.payment.status !== "ready") {
    return (
      <InlineAlert tone="info" className="mb-4">
        Card setup was canceled. Nothing was saved or charged.
      </InlineAlert>
    );
  }
  if (upgrade === "returned" && overview.plan.id !== "unlimited") {
    return (
      <InlineAlert tone="info" className="mb-4" title="Your upgrade is being confirmed">
        Your plan changes once the payment provider confirms the subscription. Refresh this page in a moment.
      </InlineAlert>
    );
  }
  if (upgrade === "canceled" && overview.plan.id !== "unlimited") {
    return (
      <InlineAlert tone="info" className="mb-4">
        Upgrade canceled. Your plan hasn’t changed.
      </InlineAlert>
    );
  }
  return null;
}
