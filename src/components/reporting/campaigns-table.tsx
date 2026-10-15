"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { DateRange } from "@/domain/date-range";
import type { CampaignSort } from "@/domain/organic-url-state";
import type { SortLink } from "./columns";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { SortHeader, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import type { CampaignRow } from "@/server/organic";
import { BreakdownDialog, type BreakdownTarget } from "./breakdown-dialog";
import { BudgetControl } from "./budget-control";
import { CampaignStatusControl } from "./campaign-status-control";
import { campaignStatusLabel, formatAverage, formatCount, formatCpm, formatPlatforms, formatSpend, formatUtcDate, EM_DASH } from "./format";
import { SelectionCheckbox, useRowSelection } from "./selection";

/**
 * Campaigns tab table (L03 column order): selection, Active, Campaign, Views,
 * Spend, CPM, Playbooks, Posts, Creators, Avg Views/post, Budget, Platform.
 * Sorting and pagination are server-side (URL); selection feeds Breakdown.
 */
export function CampaignsTable({
  slug,
  rows,
  sortLinks,
  drilldownHrefs,
  range,
  canManage,
  metricsAvailable,
  highlightId = null,
}: {
  slug: string;
  rows: CampaignRow[];
  sortLinks: Record<CampaignSort, SortLink>;
  /** Campaign name → Playbooks tab filtered by that campaign (keeps dates). */
  drilldownHrefs: Record<string, string>;
  range: DateRange;
  canManage: boolean;
  /** False while no metrics source has reported (metrics show "—", never 0). */
  metricsAvailable: boolean;
  /** A just-created campaign to call out (from `created=<id>` in the URL). */
  highlightId?: string | null;
}) {
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const selection = useRowSelection(ids);
  const [breakdown, setBreakdown] = useState<BreakdownTarget | null>(null);
  const selectedRows = rows.filter((r) => selection.selected.has(r.id));
  const metric = (value: string) => (metricsAvailable ? value : EM_DASH);

  function openBreakdown() {
    const chosen = selectedRows.length ? selectedRows : rows;
    setBreakdown({
      kind: "campaign",
      ids: chosen.map((r) => r.id),
      label: chosen.length === 1 ? chosen[0].name : selectedRows.length ? `${chosen.length} selected campaigns` : `all ${chosen.length} campaigns on this page`,
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <p className="text-[13px] text-muted" aria-live="polite">
          {selectedRows.length ? `${selectedRows.length} selected` : "Select campaigns to break down, or break down all on this page."}
        </p>
        <div className="flex items-center gap-2">
          {selectedRows.length ? (
            <Button variant="ghost" size="sm" onClick={selection.clear} className="max-md:min-h-11">
              Clear
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={openBreakdown} className="max-md:min-h-11">
            <BarChart3 className="size-3.5" aria-hidden="true" />
            Breakdown
          </Button>
        </div>
      </div>
      <TableScroll label="Campaigns">
        <Table className="min-w-[1040px]">
          <THead>
            <tr>
              <TH className="w-10">
                <SelectionCheckbox label="Select all campaigns on this page" checked={selection.allChecked} indeterminate={selection.someChecked} onChange={selection.toggleAll} />
              </TH>
              <SortHeader {...sortLinks.active} />
              <SortHeader {...sortLinks.name} />
              <SortHeader {...sortLinks.views} className="text-right" />
              <SortHeader {...sortLinks.spend} className="text-right" />
              <SortHeader {...sortLinks.cpm} className="text-right" />
              <SortHeader {...sortLinks.playbooks} className="text-right" />
              <SortHeader {...sortLinks.posts} className="text-right" />
              <SortHeader {...sortLinks.creators} className="text-right" />
              <SortHeader {...sortLinks.avg_views} className="text-right" />
              <TH>Budget</TH>
              <TH>Platform</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR
                key={row.id}
                data-highlighted={row.id === highlightId ? "true" : undefined}
                className={selection.selected.has(row.id) ? "bg-selected/40" : row.id === highlightId ? "bg-selected/60 shadow-[inset_3px_0_0_var(--color-ink)]" : undefined}
              >
                <TD>
                  <SelectionCheckbox label={`Select ${row.name}`} checked={selection.selected.has(row.id)} onChange={() => selection.toggle(row.id)} />
                </TD>
                <TD>
                  {canManage ? (
                    <CampaignStatusControl slug={slug} campaign={row} />
                  ) : (
                    <Badge tone={row.status === "active" ? "success" : row.status === "paused" ? "warning" : "neutral"}>{campaignStatusLabel(row.status)}</Badge>
                  )}
                </TD>
                <TD className="max-w-[260px] whitespace-normal">
                  <Link href={drilldownHrefs[row.id]} scroll={false} className="font-medium text-ink hover:underline">
                    {row.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    {row.id === highlightId ? "Just created · " : null}Created {formatUtcDate(row.createdAt)}
                  </span>
                </TD>
                <TD className="text-right tabular-nums">{metric(formatCount(row.views))}</TD>
                <TD className="text-right tabular-nums">{metric(formatSpend(row.spendCents))}</TD>
                <TD className="text-right tabular-nums">{metric(formatCpm(row.cpmUsd))}</TD>
                <TD className="text-right tabular-nums">{formatCount(row.playbooks)}</TD>
                <TD className="text-right tabular-nums">{metric(formatCount(row.posts))}</TD>
                <TD className="text-right tabular-nums">{metric(formatCount(row.creators))}</TD>
                <TD className="text-right tabular-nums">{metric(formatAverage(row.avgViewsPerPost))}</TD>
                <TD>
                  <BudgetControl slug={slug} campaign={row} canEdit={canManage} />
                </TD>
                <TD className="min-w-[120px] max-w-[180px] whitespace-normal text-[13px] text-ink-2">{formatPlatforms(row.platforms)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableScroll>
      <BreakdownDialog slug={slug} range={range} target={breakdown} onClose={() => setBreakdown(null)} />
    </>
  );
}
