import type { Metadata } from "next";
import { site } from "@/config/site";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { AuthHeading } from "@/components/auth/fields";
import { NewPasswordForm, RequestResetForm } from "@/components/auth/reset";
import { firstParam, type SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Reset your password" };

/** Without `?token=`: request a reset link. With one: choose a new password. */
export default async function ResetPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = firstParam(params.token);

  if (token) {
    return (
      <>
        <AuthHeading title="Choose a new password" lead="You’ll be signed in on this device, and signed out everywhere else." />
        <NewPasswordForm token={token} passwordMinLength={PASSWORD_MIN_LENGTH} />
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Reset your password" lead={`Enter the email you use for ${site.name} to get a link for choosing a new password.`} />
      <RequestResetForm supportEmail={site.supportEmail} />
    </>
  );
}
