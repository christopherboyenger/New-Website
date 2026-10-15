import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { mcpServerUrl, site } from "@/config/site";
import { getCurrentSession } from "@/server/auth/session";
import { loadOnboardingView } from "@/server/onboarding";
import { capability } from "@/server/readiness";
import { OnboardingHeader, PromoBanner } from "@/components/onboarding/shell";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata: Metadata = { title: "Set up your brand" };

/**
 * Brand onboarding. Requires a signed-in user; resumes the server-persisted
 * draft at the furthest saved screen. Users who already belong to a
 * workspace go to /home unless they ask for another workspace (`?new=1`).
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const startNew = params.new === "1";
  const current = await getCurrentSession();
  if (!current) {
    const next = startNew ? "/onboarding?new=1" : "/onboarding";
    redirect(`/auth/sign-up?next=${encodeURIComponent(next)}`);
  }

  const view = await loadOnboardingView(current.user.id, { startNew });
  if (view.kind === "redirect") redirect(view.to);

  const mcp = capability("mcp");
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-navy">
      <PromoBanner />
      <OnboardingHeader
        agent={{ configured: mcp.configured, url: mcp.configured ? mcpServerUrl() : null }}
        productName={site.name}
        supportEmail={site.supportEmail}
      />
      <OnboardingWizard
        productName={site.name}
        initial={{ step: view.step, answers: view.answers, startNew: view.startNew, payment: view.payment, forecast: view.forecast }}
      />
    </div>
  );
}
