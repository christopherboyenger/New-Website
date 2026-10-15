import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { isSalesCta, normalizeCtaSource } from "@/domain/lead";
import { isSafeReturnPath } from "@/server/auth/session";
import { getStartRedirect, getVisitorLead } from "@/server/leads";
import { ResonanceField } from "@/components/marketing/resonance-field";
import { StartFunnel } from "@/components/marketing/start-funnel";

export const metadata: Metadata = {
  title: "Get started",
  description: "Tell us about your brand and choose how to start.",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/start?cta=...` acquisition funnel. Signed-in workspace members go straight
 * to Home (L31); everyone else sees the three-step modal over a dimmed public
 * backdrop (A02–A03).
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const target = await getStartRedirect();
  if (target) redirect(target);

  const params = await searchParams;
  const rawCta = Array.isArray(params.cta) ? params.cta[0] : params.cta;
  const cta = normalizeCtaSource(rawCta);
  const lead = await getVisitorLead();

  return (
    <div className="relative min-h-dvh bg-black">
      <div aria-hidden="true" inert className="fixed inset-0 opacity-45">
        <ResonanceField intensity={0.7} />
        <div className="absolute top-0 left-0 flex h-16 items-center px-4 text-[22px] font-semibold tracking-tight text-white sm:px-6 lg:px-8">
          <span className="mr-2 grid size-6 place-items-center rounded-[6px] bg-accent">
            <span className="size-2 rounded-full bg-white" />
          </span>
          {site.wordmark}
        </div>
      </div>
      <StartFunnel
        cta={cta}
        sales={isSalesCta(cta)}
        bookingAvailable={Boolean(site.salesBookingUrl)}
        returnTo={await returnPath()}
        initial={
          lead
            ? {
                email: lead.email,
                firstName: lead.firstName,
                lastName: lead.lastName,
                phone: lead.phone,
                companyName: lead.companyName,
                companyWebsite: lead.companyWebsite,
                budgetBand: lead.budgetBand ?? "",
                jobLevel: lead.jobLevel ?? "",
                jobFunction: lead.jobFunction ?? "",
                notes: lead.notes,
              }
            : null
        }
      />
    </div>
  );
}

/** Same-origin page the visitor came from (for Close/Escape), or "/". */
async function returnPath(): Promise<string> {
  const h = await headers();
  const referer = h.get("referer");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!referer || !host) return "/";
  try {
    const url = new URL(referer);
    if (url.host !== host) return "/";
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!isSafeReturnPath(path) || url.pathname.startsWith("/start") || url.pathname.startsWith("/auth")) return "/";
    return path;
  } catch {
    return "/";
  }
}
