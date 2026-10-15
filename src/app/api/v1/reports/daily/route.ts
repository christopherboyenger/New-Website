import { dailyReport } from "@/server/reporting";
import { assertKnownParams, handleApiRequest, parseDailyReportQuery } from "@/server/integrations/reporting-api";

/** GET /api/v1/reports/daily — daily metric rows and period totals (docs/api.md). */
export async function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, "reports:read", async ({ org }, params) => {
    assertKnownParams(params, ["start_date", "end_date", "group_by", "campaign_id", "playbook_id", "metrics"]);
    return dailyReport(org.id, parseDailyReportQuery(params));
  });
}
