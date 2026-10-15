import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { creatorParticipation } from "@/components/marketing/content";
import { CtaLink, PageHero, Section, SectionHeading } from "@/components/marketing/primitives";

export const metadata: Metadata = {
  title: "For creators",
  description: "How creators join brand campaigns: connect verified accounts, follow a playbook, get posts reviewed and get paid once earnings are eligible.",
  alternates: { canonical: "/creators" },
};

const steps = [
  {
    title: "Apply and connect your accounts",
    body: "Create a creator account and connect the social accounts you post from. Accounts are verified so brands know each post comes from you.",
  },
  {
    title: "Pick up a playbook",
    body: "Campaigns you are eligible for show their playbook: the scenes to film, reference videos, and the hashtags and description to use.",
  },
  {
    title: "Post and submit for review",
    body: "Post on your own account with the campaign hashtag. The brand reviews each post; approved posts count toward the campaign.",
  },
  {
    title: "Get paid once eligible",
    body: "Earnings follow the campaign's terms. They become eligible after review and are then paid out.",
  },
];

const faqs = [
  {
    q: "Do I need a minimum following?",
    a: "Each campaign sets its own targeting. Some are open to all creators; others look for particular audiences or creator levels.",
  },
  {
    q: "Can brands use my post as an ad?",
    a: "Brands can run approved campaign posts as ads on Meta and TikTok. The campaign terms you accept explain how your content may be used.",
  },
  {
    q: "Who owns my account?",
    a: "You do. You post from your own accounts and can disconnect them from your creator profile.",
  },
];

export default function CreatorsPage() {
  return (
    <>
      <PageHero
        eyebrow="For creators"
        title="Make posts for brands, on your own account."
        intro={`${site.name} connects creators with brand campaigns. You follow a clear brief, the brand reviews your post, and you are paid under the campaign's terms.`}
      >
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <CtaLink href="/creator/sign-up">Apply as a creator</CtaLink>
        </div>
      </PageHero>

      <Section labelledBy="creator-steps-title">
        <SectionHeading id="creator-steps-title" title="How it works for creators" />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-[16px] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3 bg-black p-6">
              <span className="font-mono text-xs text-accent" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-lg font-semibold">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/65">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section labelledBy="creator-principles-title">
        <SectionHeading id="creator-principles-title" title="What to expect" />
        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {creatorParticipation.map((item) => (
            <li key={item.title} className="rounded-[14px] border border-white/10 p-6">
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="creator-faq-title">
        <SectionHeading id="creator-faq-title" title="Questions" />
        <dl className="mt-10 flex flex-col divide-y divide-white/10 border-y border-white/10">
          {faqs.map((faq) => (
            <div key={faq.q} className="grid gap-2 py-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-10">
              <dt className="font-semibold">{faq.q}</dt>
              <dd className="text-white/70">{faq.a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <CtaLink href="/creator/sign-up">Apply as a creator</CtaLink>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-white/70 underline underline-offset-4 hover:text-white">
            Are you a brand? See how it works for brands
          </Link>
        </div>
      </Section>
    </>
  );
}
