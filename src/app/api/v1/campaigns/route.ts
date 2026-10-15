import { listCampaignChoices } from "@/server/reporting";
import { assertKnownParams, handleApiRequest } from "@/server/integrations/reporting-api";

/** GET /api/v1/campaigns — campaign filter choices (docs/api.md). */
export async function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, "campaigns:read", async ({ org }, params) => {
    assertKnownParams(params, []);
    return { data: await listCampaignChoices(org.id) };
  });
}
