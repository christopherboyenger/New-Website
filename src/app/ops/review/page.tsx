import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/feedback";
import { Card, PageContainer, PageHeader } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/table";
import { ReviewCard } from "@/components/ops/review-card";
import { formatCount } from "@/lib/money";
import { requireOperatorPage } from "@/server/ops/operator";
import { parsePageParam } from "@/server/ops/pagination";
import { listReviewQueue } from "@/server/ops/review";
import { rejectionReasons, REVIEW_NOTE_MAX } from "@/server/ops/review-reasons";

export const metadata: Metadata = { title: "Review queue" };

const reasons = rejectionReasons.map(({ code, label }) => ({ code, label }));

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const operator = await requireOperatorPage();
  const queue = await listReviewQueue(operator, parsePageParam((await searchParams).page));
  const lastPage = Math.max(1, Math.ceil(queue.total / queue.pageSize));
  const href = (page: number) => (page <= 1 ? "/ops/review" : `/ops/review?page=${page}`);
  const now = new Date();

  return (
    <PageContainer>
      <PageHeader
        title="Review queue"
        description={
          queue.total
            ? `${formatCount(queue.total)} submitted post${queue.total === 1 ? "" : "s"} across all workspaces, oldest first.`
            : "Submitted posts across all workspaces, oldest first."
        }
      />
      {queue.total === 0 ? (
        <Card>
          <EmptyState title="Nothing to review" description="No posts are waiting for content review. New submissions appear here oldest first." />
        </Card>
      ) : (
        <>
          <ol className="flex flex-col gap-4" aria-label="Submitted posts">
            {queue.rows.map((item) => (
              <li key={item.postId}>
                <ReviewCard item={item} reasons={reasons} noteMax={REVIEW_NOTE_MAX} now={now} />
              </li>
            ))}
          </ol>
          {queue.total > queue.pageSize ? (
            <Card className="mt-4">
              <Pagination
                page={queue.page}
                pageSize={queue.pageSize}
                total={queue.total}
                prevHref={queue.page > 1 ? href(queue.page - 1) : null}
                nextHref={queue.page < lastPage ? href(queue.page + 1) : null}
              />
            </Card>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}
