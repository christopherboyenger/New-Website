import { completeOAuth } from "@/server/integrations/oauth";
import { isOAuthProvider } from "@/server/integrations/providers";

/**
 * GET /api/integrations/{provider}/callback — the provider redirects here
 * after authorization. completeOAuth validates and atomically consumes the
 * state, re-checks the session, user and membership, exchanges the code
 * server-side and verifies the grant with a real read. The browser is sent
 * back to the Integrations card with a result code; no code or token ever
 * appears in the redirect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await params;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!isOAuthProvider(provider)) return new Response("Not found", { status: 404, headers });
  let destination = "/home";
  try {
    destination = await completeOAuth(provider, new URL(request.url).searchParams);
  } catch (error) {
    console.error("[oauth] callback failed:", error instanceof Error ? error.name : "unknown");
  }
  return new Response(null, { status: 303, headers: { ...headers, Location: new URL(destination, request.url).toString() } });
}
