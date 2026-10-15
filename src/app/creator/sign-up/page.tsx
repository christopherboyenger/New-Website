import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { countryOptions } from "@/domain/targeting-catalog";
import { getCurrentSession } from "@/server/auth/session";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { findCreatorForUser } from "@/server/creator/context";
import { AuthFrame } from "@/components/onboarding/shell";
import { AuthHeading } from "@/components/auth/fields";
import { CreatorProfileSetupForm, CreatorSignUpForm } from "@/components/creator/sign-up-forms";

export const metadata: Metadata = { title: "Join as a creator" };

/**
 * Creator registration. Signed out: create a login and a creator profile in
 * one step. Signed in without a profile: add one to the existing account (a
 * person can be both a brand teammate and a creator). With a profile: go home.
 */
export default async function CreatorSignUpPage() {
  const current = await getCurrentSession();
  if (current && (await findCreatorForUser(current.user.id))) redirect("/creator");
  const countries = countryOptions();

  return (
    <AuthFrame>
      {current ? (
        <>
          <AuthHeading title="Create your creator profile" lead={`You're signed in as ${current.user.email}. Add a creator profile to this account to find campaigns and submit posts.`} />
          <CreatorProfileSetupForm countries={countries} />
        </>
      ) : (
        <>
          <AuthHeading title="Join as a creator" lead={`Create your ${site.name} creator account, then link the social accounts you post from.`} />
          <CreatorSignUpForm countries={countries} passwordMinLength={PASSWORD_MIN_LENGTH} signInHref={`/auth/sign-in?next=${encodeURIComponent("/creator")}`} />
        </>
      )}
    </AuthFrame>
  );
}
