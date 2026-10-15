"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, Pencil } from "lucide-react";
import type { DateRange } from "@/domain/date-range";
import type { PlaybookSort } from "@/domain/organic-url-state";
import { contentFormatLabels } from "@/domain/playbook-content";
import { Button } from "@/components/ui/button";
import { SortHeader, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import type { PlaybookRow } from "@/server/organic";
import { BreakdownDialog, type BreakdownTarget } from "./breakdown-dialog";
import type { SortLink } from "./columns";
import { EM_DASH, formatAverage, formatCount, formatCpm, formatPlatforms, formatSpend, formatUtcDate } from "./format";
import { PlaybookActiveControl } from "./playbook-active-control";
import { SelectionCheckbox, useRowSelection } from "./selection";

const rowAction =
  "inline-flex min-h-11 items-center gap-1 rounded-[6px] px-1.5 text-xs font-medium text-muted hover:bg-hover hover:text-ink md:min-h-6 focus-visible:outline-2";

/**
 * Playbooks tab table (L04 column order): selection, Active, Playbook,
 * Platforms, Type, Views, Spend, CPM, Posts, Creators, Avg Views/post,
 * Campaign; row actions Edit and Breakdown.
 */
export function PlaybooksTable({
  slug,
  rows,
  sortLinks,
  range,
  canPublish,
  canEdit,
  metricsAvailable,
}: {
  slug: string;
  rows: PlaybookRow[];
  sortLinks: Record<PlaybookSort, SortLink>;
  range: DateRange;
  canPublish: boolean;
  canEdit: boolean;
  metricsAvailable: boolean;
}) {
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const selection = useRowSelection(ids);
  const [breakdown, setBreakdown] = useState<BreakdownTarget | null>(null);
  const selectedRows = rows.filter((r) => selection.selected.has(r.id));
  const metric = (value: string) => (metricsAvailable ? value : EM_DASH);

  return (
    <>
      {selectedRows.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <p className="text-[13px] text-muted" aria-live="polite">
            {selectedRows.length} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selection.clear} className="max-md:min-h-11">
              Clear
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="max-md:min-h-11"
              onClick={() =>
                setBreakdown({
                  kind: "playbook",
                  ids: selectedRows.map((r) => r.id),
                  label: selectedRows.length === 1 ? selectedRows[0].name : `${selectedRows.length} selected playbooks`,
                })
              }
            >
              <BarChart3 className="size-3.5" aria-hidden="true" />
              Breakdown
            </Button>
          </div>
        </div>
      ) : null}
      <TableScroll label="Playbooks">
        <Table className="min-w-[1100px]">
          <THead>
            <tr>
              <TH className="w-10">
                <SelectionCheckbox label="Select all playbooks on this page" checked={selection.allChecked} indeterminate={selection.someChecked} onChange={selection.toggleAll} />
              </TH>
              <SortHeader {...sortLinks.active} />
              <SortHeader {...sortLinks.name} />
              <TH>Platforms</TH>
              <TH>Type</TH>
              <SortHeader {...sortLinks.views} className="text-right" />
              <SortHeader {...sortLinks.spend} className="text-right" />
              <SortHeader {...sortLinks.cpm} className="text-right" />
              <SortHeader {...sortLinks.posts} className="text-right" />
              <SortHeader {...sortLinks.creators} className="text-right" />
              <SortHeader {...sortLinks.avg_views} className="text-right" />
              <TH>Campaign</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.id} className={selection.selected.has(row.id) ? "bg-selected/40" : undefined}>
                <TD>
                  <SelectionCheckbox label={`Select ${row.name}`} checked={selection.selected.has(row.id)} onChange={() => selection.toggle(row.id)} />
                </TD>
                <TD>
                  <PlaybookActiveControl slug={slug} playbook={row} canPublish={canPublish} />
                </TD>
                <TD className="max-w-[280px] whitespace-normal">
                  <span className="block font-medium text-ink">{row.name}</span>
                  <span className="block text-xs text-muted">Last edited {formatUtcDate(row.updatedAt)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {canEdit ? (
                      <Link href={`/home/${slug}/playbooks/${row.id}/edit`} className={rowAction} aria-label={`Edit ${row.name}`}>
                        <Pencil className="size-3" aria-hidden="true" />
                        Edit
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className={rowAction}
                      aria-label={`Breakdown for ${row.name}`}
                      onClick={() => setBreakdown({ kind: "playbook", ids: [row.id], label: row.name })}
                    >
                      <BarChart3 className="size-3" aria-hidden="true" />
                      Breakdown
                    </button>
                  </span>
                </TD>
                <TD className="text-[13px] text-ink-2">{formatPlatforms(row.platforms)}</TD>
                <TD className="text-[13px] text-ink-2">{contentFormatLabels[row.format]}</TD>
                <TD className="text-right tabular-nums">{metric(formatCount(row.views))}</TD>
                <TD className="text-right tabular-nums">{metric(formatSpend(row.spendCents))}</TD>
                <TD className="text-right tabular-nums">{metric(formatCpm(row.cpmUsd))}</TD>
                <TD className="text-right tabular-nums">{metric(formatCount(row.posts))}</TD>
                <TD className="text-right tabular-nums">{metric(formatCount(row.creators))}</TD>
                <TD className="text-right tabular-nums">{metric(formatAverage(row.avgViewsPerPost))}</TD>
                <TD className="max-w-[200px] truncate text-[13px] text-ink-2">{row.campaignName}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableScroll>
      <BreakdownDialog slug={slug} range={range} target={breakdown} onClose={() => setBreakdown(null)} />
    </>
  );
}
