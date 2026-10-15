import type { ReactNode } from "react";
import { Gift, MessageCircleQuestion } from "lucide-react";
import { commercialPolicy } from "@/config/commercial-policy";
import { formatUsd } from "@/lib/money";
import { AgentDialogButton, type AgentConnection } from "./agent-dialog";
import { headerActionClass, Wordmark } from "./surface";

/**
 * Page chrome for the onboarding surface: the optional promotion banner and
 * the header (wordmark, agent dialog, "Questions?"). Server-renderable; the
 * agent dialog is the only interactive part.
 */

/** Spend-matching promotion. Rendered only when the commercial policy enables the offer (DEC-007). */
export function PromoBanner() {
  const offer = commercialPolicy.matchingCredit;
  if (!offer.enabled) return null;
  const cap = formatUsd(offer.capCents);
  return (
    <div className="px-4 pt-3 sm:px-7 sm:pt-4">
      <aside
        aria-label="Promotion"
        className="flex items-start gap-3 rounded-[12px] border border-success-line bg-success-soft px-4 py-3 text-sm text-success"
      >
        <Gift className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Get up to {cap} in matched credits when you start</p>
          <p>We match your campaign spend, dollar for dollar, up to {cap}.</p>
        </div>
      </aside>
    </div>
  );
}

export function OnboardingHeader({
  agent,
  productName,
  supportEmail,
}: {
  agent: AgentConnection;
  productName: string;
  supportEmail: string | null;
}) {
  return (
    <header className="border-b border-slate-line">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:h-[88px] sm:px-7">
        <Wordmark />
        <div className="flex items-center gap-2">
          <AgentDialogButton connection={agent} productName={productName} />
          {supportEmail ? (
            <a href={`mailto:${supportEmail}`} className={headerActionClass}>
              <MessageCircleQuestion className="size-4 sm:hidden" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Questions?</span>
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** Header-only frame used by the sign-in, sign-up, verification and reset pages. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-navy">
      <header className="border-b border-slate-line">
        <div className="flex h-16 items-center px-4 sm:h-[88px] sm:px-7">
          <Wordmark />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10 sm:items-center sm:pt-12">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
    </div>
  );
}
