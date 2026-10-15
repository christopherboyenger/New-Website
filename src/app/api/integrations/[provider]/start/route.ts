import { NotFoundError } from "@/server/authz";
import { startOAuth } from "@/server/integrations/oauth";
import { isOAuthProvider } from "@/server/integrations/providers";
import { metaCapabilityScopes, type MetaCapability } from "@/server/integrations/providers/meta";

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: noStore });
}

/** Same-origin form posts only (defence in depth on top of SameSite=Lax session cookies). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  return origin === new URL(request.url).origin;
}

/**
 * POST /api/integrations/{provider}/start — begins provider authorization
 * from the Integrations card. Checks membership, integrations:manage, recent
 * authentication and verified email inside startOAuth; refusals go back to
 * the card with a result code, non-members get a 404.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) return notFound();
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403, headers: noStore });

  const form = await request.formData().catch(() => null);
  const slug = form?.get("org");
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,64}$/.test(slug)) return notFound();
  const capabilityValue = form?.get("capability");
  const capability: MetaCapability = typeof capabilityValue === "string" && capabilityValue in metaCapabilityScopes ? (capabilityValue as MetaCapability) : "reporting";

  try {
    const outcome = await startOAuth(slug, provider, capability);
    return new Response(null, { status: 303, headers: { ...noStore, Location: new URL(outcome.redirectTo, request.url).toString() } });
  } catch (error) {
    if (error instanceof NotFoundError) return notFound();
    console.error("[oauth] start failed:", error instanceof Error ? error.name : "unknown");
    return new Response("Something went wrong starting the connection. Go back and try again.", { status: 500, headers: noStore });
  }
}
