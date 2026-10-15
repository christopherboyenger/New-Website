"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { RotateCcw, UserMinus } from "lucide-react";
import type { ActionResult } from "@/server/action-result";
import type { RosterRow, RosterSort, RosterTab } from "@/server/creators-roster";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/feedback";
import { FormError } from "@/components/ui/form";
import { SortHeader, Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { SelectionCheckbox, useRowSelection } from "@/components/reporting/selection";
import { ActivityHeatmap } from "./activity-heatmap";
import { CreatorAvatar } from "./creator-avatar";
import { formatMetric, formatPlatforms, levelLabel } from "./format";

export type RosterCommand = (input: { creatorIds: string[] }) => Promise<ActionResult<{ count: number }>>;

export interface SortLink {
  href: string;
  active: boolean;
  direction: "asc" | "desc";
}

const columns: Array<{ key: RosterSort; label: string; numeric: boolean }> = [
  { key: "creator", label: "Creator", numeric: false },
  { key: "level", label: "Level", numeric: false },
  { key: "posts", label: "Posts", numeric: true },
  { key: "views", label: "Views", numeric: true },
  { key: "likes", label: "Likes", numeric: true },
  { key: "comments", label: "Comments", numeric: true },
  { key: "platforms", label: "Platforms", numeric: false },
  { key: "accounts", label: "Accounts", numeric: true },
];

/**
 * Roster table. Sorting and pagination are URL/server state; row selection is
 * page-local UI state. Owners can remove (All tab) or restore (Removed tab)
 * selected creators after a confirmation that explains the consequence.
 */
export function RosterTable({
  rows,
  tab,
  canManage,
  sortLinks,
  detailHrefs,
  activityEnd,
  activityWeeks,
  empty,
  removeAction,
  restoreAction,
}: {
  rows: RosterRow[];
  tab: RosterTab;
  canManage: boolean;
  sortLinks: Record<RosterSort, SortLink>;
  detailHrefs: Record<string, string>;
  activityEnd: string;
  activityWeeks: number;
  empty: ReactNode;
  removeAction: RosterCommand;
  restoreAction: RosterCommand;
}) {
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const selection = useRowSelection(ids);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();
  const selectedIds = ids.filter((id) => selection.selected.has(id));
  const removing = tab === "all";
  const colSpan = columns.length + 1 + (canManage ? 1 : 0);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await (removing ? removeAction : restoreAction)({ creatorIds: selectedIds });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify(result.message ?? (removing ? "Creators removed." : "Creators restored."), "success");
      selection.clear();
      setConfirming(false);
    });
  }

  const count = selectedIds.length;
  const noun = count === 1 ? "creator" : "creators";

  return (
    <>
      {canManage && count > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/60 px-3 py-2">
          <p className="text-[13px] text-ink-2" aria-live="polite">
            {count} {noun} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selection.clear} className="max-md:min-h-11">
              Clear
            </Button>
            <Button variant={removing ? "secondary" : "primary"} size="sm" onClick={() => setConfirming(true)} className="max-md:min-h-11">
              {removing ? <UserMinus className="size-3.5" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
              {removing ? "Remove" : "Restore"}
            </Button>
          </div>
        </div>
      ) : null}
      <TableScroll label="Creators">
        <Table className="min-w-[1080px]">
          <THead>
            <tr>
              {canManage ? (
                <TH className="w-10">
                  <SelectionCheckbox label="Select all" checked={selection.allChecked} indeterminate={selection.someChecked} onChange={selection.toggleAll} />
                </TH>
              ) : null}
              {columns.map((c) => (
                <SortHeader key={c.key} label={c.label} {...sortLinks[c.key]} className={c.numeric ? "text-right" : undefined} />
              ))}
              <TH>Posting activity</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>{empty}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <TR key={row.id} className={selection.selected.has(row.id) ? "bg-selected/40" : undefined}>
                  {canManage ? (
                    <TD className="w-10">
                      <SelectionCheckbox label={`Select ${row.name}`} checked={selection.selected.has(row.id)} onChange={() => selection.toggle(row.id)} />
                    </TD>
                  ) : null}
                  <TD className="max-w-[260px]">
                    <Link href={detailHrefs[row.id]} scroll={false} className="flex min-w-0 items-center gap-2 rounded-md font-medium text-ink hover:underline">
                      <CreatorAvatar name={row.name} />
                      <span className="truncate">{row.name}</span>
                    </Link>
                  </TD>
                  <TD>
                    <Badge>{levelLabel(row.level)}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{row.posts.toLocaleString("en-US")}</TD>
                  <TD className="text-right tabular-nums">{formatMetric(row.views)}</TD>
                  <TD className="text-right tabular-nums">{formatMetric(row.likes)}</TD>
                  <TD className="text-right tabular-nums">{formatMetric(row.comments)}</TD>
                  <TD className="max-w-[180px] whitespace-normal text-[13px] text-ink-2">{formatPlatforms(row.platforms)}</TD>
                  <TD className="text-right tabular-nums">{row.accounts.toLocaleString("en-US")}</TD>
                  <TD>
                    <ActivityHeatmap activity={row.activity} endDay={activityEnd} weeks={activityWeeks} />
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </TableScroll>

      <Dialog
        open={confirming}
        onClose={() => {
          if (!pending) setConfirming(false);
        }}
        title={removing ? `Remove ${count} ${noun}?` : `Restore ${count} ${noun}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant={removing ? "danger" : "primary"} onClick={confirm} loading={pending}>
              {removing ? "Remove" : "Restore"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          {removing ? (
            <>
              <p>Removed creators move to the Removed tab and can&apos;t be admitted to your campaigns again until you restore them.</p>
              <p>Their existing posts, metrics and current campaign admissions are not changed.</p>
            </>
          ) : (
            <p>Restored creators return to your roster and can be admitted to your campaigns again.</p>
          )}
          <FormError message={error} />
        </div>
      </Dialog>
    </>
  );
}
