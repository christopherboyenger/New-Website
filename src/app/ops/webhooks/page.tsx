import type { Metadata } from "next";
import { formatUtcInstant } from "@/components/workspace/format";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Card, PageContainer, PageHeader } from "@/components/ui/layout";
import { Pagination, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { LinkTabs } from "@/components/ui/tabs";
import { formatCount } from "@/lib/money";
import { requireOperatorPage } from "@/server/ops/operator";
import { parsePageParam } from "@/server/ops/pagination";
import { listWebhookIssues, parseWebhookFilter, webhookIssueCounts, type WebhookIssueFilter } from "@/server/ops/webhooks";

export const metadata: Metadata = { title: "Webhooks" };

function filterHref(filter: WebhookIssueFilter, page = 1): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/ops/webhooks${qs ? `?${qs}` : ""}`;
}

/** Read-only view of inbound webhooks that were quarantined or failed processing. Payloads are never shown. */
export default async function WebhooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const operator = await requireOperatorPage();
  const sp = await searchParams;
  const filter = parseWebhookFilter(sp.status);
  const [counts, list] = await Promise.all([webhookIssueCounts(operator), listWebhookIssues(operator, filter, parsePageParam(sp.page))]);
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <PageContainer>
      <PageHeader title="Webhooks" description="Inbound provider events that were quarantined or failed. Read-only; payloads are not shown." />
      <Card>
        <LinkTabs
          label="Webhook status"
          activeKey={filter}
          className="px-3"
          tabs={[
            { key: "all", label: <span className="whitespace-nowrap">All issues</span>, href: filterHref("all"), count: counts.quarantined + counts.failed },
            { key: "quarantined", label: "Quarantined", href: filterHref("quarantined"), count: counts.quarantined },
            { key: "failed", label: "Failed", href: filterHref("failed"), count: counts.failed },
          ]}
        />
        {list.total === 0 ? (
          <EmptyState
            headingLevel={2}
            title={filter === "all" ? "No webhook issues" : `No ${filter} webhooks`}
            description="Quarantined and failed inbound events appear here for reconciliation."
          />
        ) : (
          <>
            <TableScroll label="Webhook issues">
              <Table>
                <THead>
                  <tr>
                    <TH>Provider</TH>
                    <TH>Event type</TH>
                    <TH>Event ID</TH>
                    <TH>Received</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Attempts</TH>
                    <TH>Error</TH>
                  </tr>
                </THead>
                <tbody>
                  {list.rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        {row.provider}
                        <span className="ml-1 text-xs text-muted">{row.environment}</span>
                      </TD>
                      <TD className="font-mono text-[13px]">{row.eventType}</TD>
                      <TD className="font-mono text-[13px] text-ink-2">{row.eventId}</TD>
                      <TD className="text-ink-2">
                        <time dateTime={row.receivedAt.toISOString()}>{formatUtcInstant(row.receivedAt)}</time>
                      </TD>
                      <TD>
                        <Badge tone={row.status === "failed" ? "danger" : "warning"}>{row.status === "failed" ? "Failed" : "Quarantined"}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">{formatCount(row.attempts)}</TD>
                      <TD className="min-w-64 max-w-md whitespace-normal break-words text-[13px] text-ink-2">
                        {row.lastError ?? <span className="text-muted">No error recorded</span>}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
            <div className="border-t border-line">
              <Pagination
                page={list.page}
                pageSize={list.pageSize}
                total={list.total}
                prevHref={list.page > 1 ? filterHref(filter, list.page - 1) : null}
                nextHref={list.page < lastPage ? filterHref(filter, list.page + 1) : null}
              />
            </div>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
