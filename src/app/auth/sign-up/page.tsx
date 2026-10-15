import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { getCurrentSession } from "@/server/auth/session";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { AuthHeading } from "@/components/auth/fields";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { emailParam, safeNextParam, withNext, type SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Create your account" };

/** Account creation. Accepts `?email=` (prefill) and a safe `?next=`; continues to onboarding by default. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const next = safeNextParam(params.next);
  if (await getCurrentSession()) redirect(next ?? "/home");

  return (
    <>
      <AuthHeading title="Create your account" lead={`Set up your login, then tell us about your brand to start using ${site.name}.`} />
      <SignUpForm
        next={next}
        defaultEmail={emailParam(params.email)}
        signInHref={withNext("/auth/sign-in", next)}
        passwordMinLength={PASSWORD_MIN_LENGTH}
      />
    </>
  );
}
