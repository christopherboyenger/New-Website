import type { Metadata } from "next";
import { getCurrentSession } from "@/server/auth/session";
import { devToolsEnabled } from "@/server/env";
import { latestVerificationDelivery } from "@/server/onboarding";
import { ButtonLink } from "@/components/ui/button";
import { AuthHeading } from "@/components/auth/fields";
import { ConfirmEmailForm, ResendVerification } from "@/components/auth/verify";
import { firstParam, type SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Verify your email" };

/**
 * Email verification. With `?token=` the person confirms explicitly; without
 * one, a signed-in unverified user can request a new link and sees the real
 * delivery state of the last one.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = firstParam(params.token);
  const current = await getCurrentSession();
  const devOutboxHref = devToolsEnabled() ? "/dev/outbox" : null;

  if (current?.user.emailVerifiedAt) {
    return (
      <>
        <AuthHeading title="Your email address is verified" lead={current.user.email} />
        <ButtonLink href="/home" variant="navy" size="lg" className="h-12 w-full">
          Continue
        </ButtonLink>
      </>
    );
  }

  if (token) {
    return (
      <>
        <AuthHeading title="Verify your email address" lead="Confirm that this is your email address to finish setting up your account." />
        <ConfirmEmailForm
          token={token}
          continueHref={current ? "/home" : "/auth/sign-in"}
          continueLabel={current ? "Continue" : "Sign in"}
          fallback={
            current ? (
              <ResendVerification email={current.user.email} devOutboxHref={devOutboxHref} />
            ) : (
              <ButtonLink href="/auth/sign-in?next=%2Fauth%2Fverify" variant="secondary" size="lg" className="h-12 w-full">
                Sign in to request a new link
              </ButtonLink>
            )
          }
        />
      </>
    );
  }

  if (!current) {
    return (
      <>
        <AuthHeading title="Verify your email address" lead="Open the link in your verification email, or sign in to request a new one." />
        <ButtonLink href="/auth/sign-in?next=%2Fauth%2Fverify" variant="navy" size="lg" className="h-12 w-full">
          Sign in
        </ButtonLink>
      </>
    );
  }

  const latest = await latestVerificationDelivery(current.user.email);
  return (
    <>
      <AuthHeading title="Verify your email address" lead="Open the link in your verification email to confirm your address." />
      <ResendVerification email={current.user.email} devOutboxHref={devOutboxHref} latest={latest} />
    </>
  );
}
