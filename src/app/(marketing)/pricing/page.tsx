import type { Metadata } from "next";
import { Check, Info, Minus } from "lucide-react";
import { commercialPolicy, paymentSetupDisclosure, planSummary } from "@/config/commercial-policy";
import { features, hasFeature, type Feature } from "@/domain/entitlements";
import { formatUsd } from "@/lib/money";
import { startHref } from "@/components/marketing/content";
import { CtaLink, PageHero, Section, SectionHeading } from "@/components/marketing/primitives";
import type { PlanId } from "@/server/db/schema/core";

const { basic, unlimited } = commercialPolicy.plans;
/** "Standard with no monthly platform fee" — names and fee wording follow the commercial policy. */
const basicLead = `${basic.displayName}${basic.monthlyPriceCents === 0 ? " with no monthly platform fee" : ""}`;

export const metadata: Metadata = {
  title: "Pricing",
  description: `Plans for running creator campaigns: ${basicLead} and ${unlimited.displayName} with advanced controls.`,
  alternates: { canonical: "/pricing" },
};

const planOrder: PlanId[] = ["basic", "unlimited"];
const planCta: Record<PlanId, string> = { basic: "pricing_standard", unlimited: "pricing_unlimited" };

/** Labels for plan-gated capabilities (src/domain/entitlements.ts). */
const featureLabels: Record<Feature, string> = {
  manual_pricing: "Manual pricing",
  cpm_cap: "CPM caps",
  demographic_targeting: "Age, gender and metro targeting",
  creator_level_targeting: "Creator-level targeting",
  creator_approval: "Approve creators before they join",
  dedicated_accounts: "Require dedicated creator accounts",
  creator_messaging: "Message creators",
};

const sharedCapabilities = ["Campaigns, playbooks and creator posts", "Organic reporting by UTC day", "Posts to Meta and TikTok ads", "Reporting API access"];

export default function PricingPage() {
  const thresholds = commercialPolicy.billingThresholdOptionsCents.map((c) => formatUsd(c)).join(", ");

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Pay as creators earn."
        intro={`Start on ${basicLead}, or choose ${unlimited.displayName} for advanced targeting, approvals and creator messaging.`}
      >
        {!commercialPolicy.decided ? (
          <p className="mt-8 inline-flex items-start gap-2 rounded-[10px] border border-white/15 px-3.5 py-2.5 text-sm text-white/75" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Preview pricing — final terms are confirmed before you&apos;re charged.
          </p>
        ) : null}
      </PageHero>

      <div className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6 lg:px-8">
        <ul className="grid gap-6 md:grid-cols-2">
          {planOrder.map((planId) => {
            const plan = commercialPolicy.plans[planId];
            const featured = planId === "unlimited";
            return (
              <li
                key={planId}
                aria-labelledby={`plan-${planId}`}
                className={`flex flex-col rounded-[16px] border p-7 sm:p-8 ${featured ? "border-accent/70 bg-white/[0.03]" : "border-white/15"}`}
              >
                <h2 id={`plan-${planId}`} className="text-xl font-semibold">
                  {plan.displayName}
                </h2>
                <p className="mt-5 flex items-baseline gap-2">
                  {plan.monthlyPriceCents === 0 ? (
                    <span className="text-4xl font-semibold tracking-tight">No monthly fee</span>
                  ) : (
                    <>
                      <span className="text-5xl font-semibold tracking-tight">{formatUsd(plan.monthlyPriceCents)}</span>
                      <span className="text-white/60">/ month</span>
                    </>
                  )}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{planSummary(planId)}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-white/10 pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm text-white/85">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <CtaLink href={startHref(planCta[planId])} variant={featured ? "accent" : "light"} className="mt-8 w-full">
                  Get started with {plan.displayName}
                </CtaLink>
              </li>
            );
          })}
        </ul>
        {commercialPolicy.matchingCredit.enabled ? (
          <p className="mt-6 text-sm text-white/70">
            New workspaces can receive matched campaign credit up to {formatUsd(commercialPolicy.matchingCredit.capCents)}. Eligibility terms apply.
          </p>
        ) : null}
      </div>

      <Section labelledBy="compare-title">
        <SectionHeading id="compare-title" title="Compare plans" />
        <div className="relative mt-10 overflow-x-auto rounded-[14px] border border-white/10" role="region" aria-label="Plan comparison" tabIndex={0}>
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Capabilities included in each plan</caption>
            <thead>
              <tr className="border-b border-white/10 text-white/60">
                <th scope="col" className="px-5 py-3 font-medium">
                  Capability
                </th>
                {planOrder.map((planId) => (
                  <th key={planId} scope="col" className="w-36 px-5 py-3 font-medium">
                    {commercialPolicy.plans[planId].displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sharedCapabilities.map((label) => (
                <ComparisonRow key={label} label={label} included={() => true} />
              ))}
              {features.map((feature) => (
                <ComparisonRow key={feature} label={featureLabels[feature]} included={(planId) => hasFeature(planId, feature)} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section labelledBy="billing-title">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading id="billing-title" title="How billing works" />
          <dl className="flex flex-col gap-8 text-base leading-relaxed">
            <div>
              <dt className="font-semibold">You pay as creators earn</dt>
              <dd className="mt-2 text-white/70">
                Campaign spend accrues as approved posts earn. You are charged each time accrued spend reaches your billing threshold — a monetary amount
                ({thresholds}), not a time interval.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Adding a payment method</dt>
              <dd className="mt-2 text-white/70">{paymentSetupDisclosure()}</dd>
            </div>
            <div>
              <dt className="font-semibold">Publishing</dt>
              <dd className="mt-2 text-white/70">
                A payment method is needed before a playbook can go live. Publishing never charges by itself; you confirm each step.
              </dd>
            </div>
          </dl>
        </div>
      </Section>
    </>
  );
}

function ComparisonRow({ label, included }: { label: string; included: (planId: PlanId) => boolean }) {
  return (
    <tr className="border-b border-white/10 last:border-b-0">
      <th scope="row" className="px-5 py-3.5 font-normal text-white/85">
        {label}
      </th>
      {planOrder.map((planId) => (
        <td key={planId} className="px-5 py-3.5">
          {included(planId) ? (
            <>
              <Check className="size-4 text-accent" aria-hidden="true" />
              <span className="sr-only">Included</span>
            </>
          ) : (
            <>
              <Minus className="size-4 text-white/35" aria-hidden="true" />
              <span className="sr-only">Not included</span>
            </>
          )}
        </td>
      ))}
    </tr>
  );
}
