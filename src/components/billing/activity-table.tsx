import type { LedgerPage } from "@/server/billing/ledger";
import type { ActivityTab } from "@/server/billing/rules";
import { EmptyState } from "@/components/ui/feedback";
import { Pagination, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { formatSignedCents } from "./money-figure";

const creditLabels: Record<string, string> = {
  subscription_credit: "Subscription credit",
  matching_credit: "Matching credit",
  validation_credit: "Validation credit",
};

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Ledger entries for one activity tab (server-rendered, server-paginated). Dates are UTC days. */
export function ActivityTable({
  tab,
  page,
  hrefForPage,
  emptyAction,
}: {
  tab: ActivityTab;
  page: LedgerPage;
  hrefForPage: (page: number) => string;
  /** Shown in the empty state (e.g. the billing set-up panel). */
  emptyAction?: React.ReactNode;
}) {
  if (page.total === 0) {
    return (
      emptyAction ?? (
        <EmptyState
          title={tab === "payments" ? "No payments in this period" : "No credit activity in this period"}
          description={tab === "payments" ? "Charges appear here once your payment provider confirms them." : "Credits granted or applied appear here."}
        />
      )
    );
  }
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
  return (
    <div>
      <TableScroll label={tab === "payments" ? "Payment activity" : "Credits"}>
        <Table>
          <THead>
            <tr>
              <TH scope="col">Date (UTC)</TH>
              {tab === "credits" ? <TH scope="col">Credit</TH> : null}
              <TH scope="col">Description</TH>
              <TH scope="col" className="text-right">
                Amount
              </TH>
            </tr>
          </THead>
          <tbody>
            {page.rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap">
                  <time dateTime={row.occurredAt.toISOString()}>{dateFormat.format(row.occurredAt)}</time>
                </TD>
                {tab === "credits" ? <TD className="whitespace-nowrap">{creditLabels[row.account] ?? row.account}</TD> : null}
                <TD>{row.description}</TD>
                <TD className="text-right tabular-nums whitespace-nowrap">
                  {formatSignedCents(row.amountCents)}
                  {row.currency !== "usd" ? <span className="ml-1 text-xs uppercase text-muted">{row.currency}</span> : null}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableScroll>
      <Pagination
        page={page.page}
        pageSize={page.pageSize}
        total={page.total}
        prevHref={page.page > 1 ? hrefForPage(page.page - 1) : null}
        nextHref={page.page < lastPage ? hrefForPage(page.page + 1) : null}
      />
    </div>
  );
}
