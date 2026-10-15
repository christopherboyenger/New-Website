import { listPlaybookChoices } from "@/server/reporting";
import { assertKnownParams, handleApiRequest } from "@/server/integrations/reporting-api";

/** GET /api/v1/playbooks — playbook filter choices (docs/api.md). */
export async function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, "playbooks:read", async ({ org }, params) => {
    assertKnownParams(params, []);
    return { data: await listPlaybookChoices(org.id) };
  });
}
