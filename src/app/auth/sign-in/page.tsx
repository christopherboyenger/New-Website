import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { getCurrentSession } from "@/server/auth/session";
import { AuthHeading } from "@/components/auth/fields";
import { SignInForm } from "@/components/auth/sign-in-form";
import { emailParam, safeNextParam, withNext, type SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const next = safeNextParam(params.next);
  if (await getCurrentSession()) redirect(next ?? "/home");

  return (
    <>
      <AuthHeading title="Sign in" lead={`Welcome back to ${site.name}.`} />
      <SignInForm next={next} defaultEmail={emailParam(params.email)} signUpHref={withNext("/auth/sign-up", next)} />
    </>
  );
}
