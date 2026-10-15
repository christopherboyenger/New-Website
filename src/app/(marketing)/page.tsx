import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ClipboardList, Eye, Wallet } from "lucide-react";
import { site } from "@/config/site";
import { creatorParticipation, integrations, productSections, startHref } from "@/components/marketing/content";
import { CtaLink, Eyebrow, Section, SectionHeading } from "@/components/marketing/primitives";
import { ProductDiagram } from "@/components/marketing/product-diagrams";
import { ProductPreviewTabs } from "@/components/marketing/product-preview-tabs";
import { ResonanceField } from "@/components/marketing/resonance-field";
import { WorkflowSteps } from "@/components/marketing/workflow-steps";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — creator-led growth, from brief to paid ads` },
  description:
    "Brief creators with playbooks, review what they post, report on every approved post and run the best ones as Meta and TikTok ads.",
  alternates: { canonical: "/" },
};

const participationIcons = [BadgeCheck, ClipboardList, Eye, Wallet];

export default function HomePage() {
  const diagrams = Object.fromEntries(productSections.map((s) => [s.id, <ProductDiagram key={s.id} id={s.id} />])) as Record<
    (typeof productSections)[number]["id"],
    React.ReactNode
  >;

  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative isolate flex min-h-[640px] items-center overflow-hidden sm:min-h-[100svh]">
        <div className="absolute inset-0 -z-10">
          <ResonanceField />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_55%,rgb(0_0_0/0.72),transparent_65%)]" />
        </div>
        <div className="mx-auto w-full max-w-[1440px] px-4 pt-28 pb-20 sm:px-6 lg:px-[15%]">
          <Eyebrow>Creator marketing platform</Eyebrow>
          <h1 id="hero-title" className="mt-6 max-w-5xl text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-7xl lg:text-[84px]">
            Growth that starts with a creator&apos;s first post.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            Brief creators with playbooks, review what they make, see which posts work, and run the best ones as paid ads, all in one workspace.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <CtaLink href={startHref("hero_primary")}>Get started</CtaLink>
            <CtaLink href={startHref("hero_sales")} variant="light">
              Talk to Sales
            </CtaLink>
          </div>
        </div>
      </section>

      {/* Product previews */}
      <Section id="products" labelledBy="products-title">
        {productSections.map((s) => (
          <span key={s.id} id={s.id} className="block scroll-mt-24" aria-hidden="true" />
        ))}
        <SectionHeading
          id="products-title"
          eyebrow="Product"
          title="One workspace for the whole creator program."
          intro="From the brief to the ad account: write playbooks, follow results and reuse what works."
        />
        <div className="mt-12">
          <ProductPreviewTabs sections={productSections} diagrams={diagrams} />
        </div>
      </Section>

      {/* Workflow */}
      <Section id="workflow" labelledBy="workflow-title">
        <SectionHeading
          id="workflow-title"
          eyebrow="How it works"
          title="Five steps from brief to Paid Ads."
          intro="Each step is something you control. Nothing publishes, launches or charges without your confirmation."
        />
        <WorkflowSteps />
        <Link href="/how-it-works" className="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-white underline underline-offset-4 hover:text-white/80">
          Read how it works in detail
        </Link>
      </Section>

      {/* Creators */}
      <Section id="creators" labelledBy="creators-title">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            id="creators-title"
            eyebrow="Creators"
            title="How creators take part."
            intro="Creators join with their own accounts, follow your playbook and get paid under the campaign's terms."
          />
          <ul className="grid gap-px overflow-hidden rounded-[16px] border border-white/10 bg-white/10 sm:grid-cols-2">
            {creatorParticipation.map((item, i) => {
              const Icon = participationIcons[i];
              return (
                <li key={item.title} className="bg-black p-6">
                  <Icon className="size-5 text-accent" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
        <Link href="/creators" className="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-white underline underline-offset-4 hover:text-white/80">
          Information for creators
        </Link>
      </Section>

      {/* Integrations */}
      <Section id="integrations" labelledBy="integrations-title">
        <SectionHeading
          id="integrations-title"
          eyebrow="Integrations"
          title="Connects to where your ads and installs live."
          intro="Connections are made from your workspace with your own accounts, and you can disconnect them at any time."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((integration) => (
            <li key={integration.name} className="rounded-[14px] border border-white/10 p-6">
              <span className="inline-flex rounded-full border border-white/20 px-3 py-1 text-sm font-medium">{integration.name}</span>
              <p className="mt-4 text-sm leading-relaxed text-white/65">{integration.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* Closing */}
      <section aria-labelledby="closing-title" className="relative isolate overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 -z-10 opacity-60">
          <ResonanceField intensity={0.6} />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(0_0_0/0.8),transparent_70%)]" />
        </div>
        <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 py-28 text-center sm:px-6 sm:py-36 lg:px-8">
          <h2 id="closing-title" className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Start with one campaign.
          </h2>
          <p className="mt-5 max-w-xl text-lg text-white/70">Create a workspace, write your first playbook and publish when you are ready.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <CtaLink href={startHref("closing")}>Get started</CtaLink>
            <CtaLink href="/pricing" variant="outline">
              See pricing
            </CtaLink>
          </div>
        </div>
      </section>
    </>
  );
}
