"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "@/domain/date-range";
import { formatRangeLabel } from "@/domain/date-range";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { loadBreakdownAction } from "@/app/home/[org]/(workspace)/campaigns/actions";
import type { Breakdown } from "@/server/organic";
import { formatCount, formatCpm, formatLongDay, formatSpend } from "./format";

export interface BreakdownTarget {
  kind: "campaign" | "playbook";
  ids: string[];
  /** Shown in the title while loading. */
  label: string;
}

type LoadResult = { status: "error"; message: string } | { status: "ready"; data: Breakdown };
type LoadState = { status: "loading" } | LoadResult;

/**
 * Daily breakdown (views, spend, weighted CPM, posts, creators per UTC day)
 * for selected campaigns or playbooks, from the reporting daily report.
 * Days without activity are omitted (sparse rows, DEC-011); totals are range
 * totals (weighted CPM, deduplicated posts/creators), not column sums.
 */
export function BreakdownDialog({ slug, range, target, onClose }: { slug: string; range: DateRange; target: BreakdownTarget | null; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const key = target ? `${target.kind}:${target.ids.join(",")}:${range.from}:${range.to}:${attempt}` : null;
  // A result belongs to the request that produced it; any other request shows as loading.
  const [loaded, setLoaded] = useState<{ key: string; result: LoadResult } | null>(null);
  const state: LoadState = key !== null && loaded?.key === key ? loaded.result : { status: "loading" };

  useEffect(() => {
    if (!target || !key) return;
    let cancelled = false;
    loadBreakdownAction(slug, { kind: target.kind, ids: target.ids, from: range.from, to: range.to }).then(
      (result) => {
        if (cancelled) return;
        setLoaded({ key, result: result.ok ? { status: "ready", data: result.data } : { status: "error", message: result.error } });
      },
      () => {
        if (!cancelled) setLoaded({ key, result: { status: "error", message: "The breakdown couldn't be loaded. Check your connection and try again." } });
      },
    );
    return () => {
      cancelled = true;
    };
    // `key` captures every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slug]);

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      size="lg"
      title={`Breakdown: ${target?.label ?? ""}`}
      description={`${formatRangeLabel(range)} · daily, all times in UTC`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {state.status === "loading" ? (
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">Loading breakdown…</span>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <InlineAlert
          tone="danger"
          title="Breakdown unavailable"
          action={
            <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          }
        >
          {state.message}
        </InlineAlert>
      ) : state.data.days.length === 0 ? (
        <EmptyState title="No views or spend in this range" description="Approved posts earn views and spend once they're live. Try a longer date range." />
      ) : (
        <BreakdownTable data={state.data} />
      )}
    </Dialog>
  );
}

function BreakdownTable({ data }: { data: Breakdown }) {
  return (
    <TableScroll label="Daily breakdown">
      <Table>
        <caption className="sr-only">Daily views, spend, CPM, posts and creators for {data.names.join(", ")}. Days without activity are omitted.</caption>
        <THead>
          <tr>
            <TH>Day (UTC)</TH>
            <TH className="text-right">Views</TH>
            <TH className="text-right">Spend</TH>
            <TH className="text-right">CPM</TH>
            <TH className="text-right">Posts</TH>
            <TH className="text-right">Creators</TH>
          </tr>
        </THead>
        <tbody>
          {data.days.map((d) => (
            <TR key={d.date}>
              <TD>{formatLongDay(d.date)}</TD>
              <TD className="text-right tabular-nums">{formatCount(d.views)}</TD>
              <TD className="text-right tabular-nums">{formatSpend(d.spendCents)}</TD>
              <TD className="text-right tabular-nums">{formatCpm(d.cpmUsd)}</TD>
              <TD className="text-right tabular-nums">{formatCount(d.posts)}</TD>
              <TD className="text-right tabular-nums">{formatCount(d.creators)}</TD>
            </TR>
          ))}
        </tbody>
        <tfoot className="border-t border-line-strong font-medium">
          <tr>
            <th scope="row" className="px-3 py-2.5 text-left text-sm font-medium text-ink">
              Range total
            </th>
            <TD className="text-right tabular-nums font-medium">{formatCount(data.totals.views)}</TD>
            <TD className="text-right tabular-nums font-medium">{formatSpend(data.totals.spendCents)}</TD>
            <TD className="text-right tabular-nums font-medium">{formatCpm(data.totals.cpmUsd)}</TD>
            <TD className="text-right tabular-nums font-medium">{formatCount(data.totals.posts)}</TD>
            <TD className="text-right tabular-nums font-medium">{formatCount(data.totals.creators)}</TD>
          </tr>
        </tfoot>
      </Table>
      <p className="mt-2 text-xs text-muted">Totals count each post and creator once across the range, so they can be lower than the sum of the days.</p>
    </TableScroll>
  );
}
