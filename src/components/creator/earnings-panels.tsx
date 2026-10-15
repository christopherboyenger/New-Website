import { Wallet } from "lucide-react";
import { formatUsd } from "@/lib/money";
import type { EarningsSummary } from "@/server/creator/fulfillment";
import type { CapabilityState } from "@/server/readiness";
import { NotConfiguredNotice } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { formatUtcDate } from "@/components/creators/format";

/**
 * Earnings read the creator_obligation ledger only. With no entries the
 * balance is a confirmed $0 and the panel explains when earnings start; no
 * estimate or projected amount is ever shown.
 */
export function EarningsPanel({ earnings }: { earnings: EarningsSummary }) {
  return (
    <Card>
      <CardHeader title="Earnings" description="Amounts brands owe you for approved posts." />
      <CardBody>
        <p className="text-2xl font-semibold tabular-nums text-ink">{formatUsd(earnings.balanceCents, { decimals: 2 })}</p>
        {earnings.entryCount === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No earnings yet. Earnings start once a brand approves your post, its views are verified from the platform, and the campaign&apos;s earning terms are in place. Nothing is estimated in advance.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {earnings.recent.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{entry.description}</span>
                  <span className="text-xs text-muted">
                    {entry.brandName} · <time dateTime={entry.occurredAt}>{formatUtcDate(entry.occurredAt)}</time>
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-ink">{formatUsd(entry.amountCents, { decimals: 2 })}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function PayoutPanel({ readiness }: { readiness: CapabilityState }) {
  return (
    <Card>
      <CardHeader title="Payouts" description="Where your earnings are paid." />
      <CardBody>
        {readiness.configured ? (
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Wallet className="size-4 text-muted" aria-hidden="true" />
            A payout provider is configured for this service, but payout account setup isn&apos;t available in the creator portal yet.
          </p>
        ) : (
          <NotConfiguredNotice title="Payouts aren't set up yet">
            This service hasn&apos;t connected a payout provider yet, so bank details can&apos;t be added and nothing can be paid out. Your approved posts and any earnings are still recorded.
          </NotConfiguredNotice>
        )}
      </CardBody>
    </Card>
  );
}
