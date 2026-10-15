import Link from "next/link";
import { Eye, Flame, MessageCircleHeart } from "lucide-react";
import { formatCount } from "@/lib/money";
import type { RosterSummary, SummaryLeader } from "@/server/creators-roster";

interface CardSpec {
  key: "mostViews" | "mostViral" | "mostEngaging";
  title: string;
  icon: typeof Eye;
  value: (leader: SummaryLeader) => string;
  definition: (days: number) => string;
}

const cards: CardSpec[] = [
  {
    key: "mostViews",
    title: "Most Views",
    icon: Eye,
    value: (l) => `${formatCount(l.value)} views`,
    definition: (days) => `Most views earned in the last ${days} days`,
  },
  {
    key: "mostViral",
    title: "Most Viral",
    icon: Flame,
    value: (l) => `${formatCount(l.value)} views on one post`,
    definition: (days) => `Biggest single post published in the last ${days} days`,
  },
  {
    key: "mostEngaging",
    title: "Most Engaging",
    icon: MessageCircleHeart,
    value: (l) => `${l.value.toFixed(1)}% engagement`,
    definition: (days) => `Highest (likes + comments) ÷ views on posts from the last ${days} days, min. 1,000 views`,
  },
];

/** Leader cards computed from real roster data; "No data yet" when nothing qualifies. */
export function SummaryCards({ summary, detailHref }: { summary: RosterSummary; detailHref: (creatorId: string) => string }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map(({ key, title, icon: Icon, value, definition }) => {
        const leader = summary[key];
        return (
          <li key={key} className="flex min-h-[104px] flex-col gap-1 rounded-[12px] border border-line bg-surface px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
              <Icon className="size-3.5" aria-hidden="true" />
              {title}
            </p>
            {leader ? (
              <>
                <Link href={detailHref(leader.creatorId)} scroll={false} className="truncate text-[15px] font-semibold text-ink hover:underline">
                  {leader.name}
                </Link>
                <p className="text-sm tabular-nums text-ink-2">{value(leader)}</p>
              </>
            ) : (
              <p className="text-[15px] font-semibold text-subtle">No data yet</p>
            )}
            <p className="mt-auto text-xs text-muted">{definition(summary.windowDays)}</p>
          </li>
        );
      })}
    </ul>
  );
}
