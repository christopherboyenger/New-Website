import type { Metadata } from "next";
import { formatUtcInstant } from "@/components/workspace/format";
import { EmptyState } from "@/components/ui/feedback";
import { Card, PageContainer, PageHeader } from "@/components/ui/layout";
import { Pagination, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount } from "@/lib/money";
import { listLeads } from "@/server/ops/leads";
import { requireOperatorPage } from "@/server/ops/operator";
import { parsePageParam } from "@/server/ops/pagination";

export const metadata: Metadata = { title: "Leads" };

/** Acquisition funnel steps (see /start): 1 email, 2 brand details, 3 route chosen. */
const LEAD_STEPS = 3;

/** Read-only list of acquisition leads, newest first. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const operator = await requireOperatorPage();
  const list = await listLeads(operator, parsePageParam((await searchParams).page));
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (page: number) => (page <= 1 ? "/ops/leads" : `/ops/leads?page=${page}`);
  const none = <span className="text-muted">—</span>;

  return (
    <PageContainer>
      <PageHeader
        title="Leads"
        description={list.total ? `${formatCount(list.total)} lead${list.total === 1 ? "" : "s"} from the acquisition funnel, newest first.` : "Leads from the acquisition funnel, newest first."}
      />
      <Card>
        {list.total === 0 ? (
          <EmptyState headingLevel={2} title="No leads yet" description="Leads appear here when visitors enter their work email in the acquisition funnel." />
        ) : (
          <>
            <TableScroll label="Leads">
              <Table>
                <THead>
                  <tr>
                    <TH>Email</TH>
                    <TH>Company</TH>
                    <TH>Budget band</TH>
                    <TH>CTA</TH>
                    <TH>Step</TH>
                    <TH>Created</TH>
                  </tr>
                </THead>
                <tbody>
                  {list.rows.map((lead) => (
                    <TR key={lead.id}>
                      <TD>{lead.email}</TD>
                      <TD>{lead.companyName || none}</TD>
                      <TD>{lead.budgetBand ?? none}</TD>
                      <TD>{lead.ctaSource ? <span className="font-mono text-[13px] text-ink-2">{lead.ctaSource}</span> : none}</TD>
                      <TD className="tabular-nums">
                        {Math.min(lead.stepReached, LEAD_STEPS)} of {LEAD_STEPS}
                      </TD>
                      <TD className="text-ink-2">
                        <time dateTime={lead.createdAt.toISOString()}>{formatUtcInstant(lead.createdAt)}</time>
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
                prevHref={list.page > 1 ? href(list.page - 1) : null}
                nextHref={list.page < lastPage ? href(list.page + 1) : null}
              />
            </div>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
