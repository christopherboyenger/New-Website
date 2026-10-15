import { queryPosts, type PostRow } from "@/server/reporting";
import { assertKnownParams, handleApiRequest, parsePostsQuery } from "@/server/integrations/reporting-api";

/** Fields exposed by the public API (internal review state is not part of the contract). */
function publicPost(row: PostRow): Omit<PostRow, "review_status"> {
  const copy: Partial<PostRow> = { ...row };
  delete copy.review_status;
  return copy as Omit<PostRow, "review_status">;
}

/** GET /api/v1/posts — paginated drilldown of approved posts (docs/api.md). */
export async function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, "reports:read", async ({ org }, params) => {
    assertKnownParams(params, ["start_date", "end_date", "mode", "campaign_id", "playbook_id", "page", "page_size", "sort", "order"]);
    // Approved posts only: queryPosts defaults to approved when no review statuses are given.
    const page = await queryPosts(org.id, parsePostsQuery(params));
    return { meta: page.meta, data: page.data.map(publicPost) };
  });
}
