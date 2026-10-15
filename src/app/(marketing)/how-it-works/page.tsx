import type { Metadata } from "next";
import { startHref } from "@/components/marketing/content";
import { CtaLink, PageHero } from "@/components/marketing/primitives";
import { WorkflowDetail } from "@/components/marketing/workflow-steps";

export const metadata: Metadata = {
  title: "How it works",
  description: "Five steps from brief to Paid Ads: campaign and playbook, creator recruitment, management and payment, paid ads, and content iteration.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="Five steps from brief to Paid Ads."
        intro="A creator program runs as a loop: brief, recruit, review and pay, amplify, then improve the brief. Here is what happens at each step and who does what."
      />
      <div className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6 lg:px-8">
        <WorkflowDetail />
        <div className="flex flex-col gap-4 border-t border-white/10 pt-12 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xl font-semibold">Ready to write your first playbook?</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <CtaLink href={startHref("how_it_works")}>Get started</CtaLink>
            <CtaLink href="/pricing" variant="outline">
              See pricing
            </CtaLink>
          </div>
        </div>
      </div>
    </>
  );
}
