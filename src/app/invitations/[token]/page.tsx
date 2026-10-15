import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { getCurrentSession } from "@/server/auth/session";
import { findInvitationByToken, maskEmail } from "@/server/invitations";
import { Button, ButtonLink } from "@/components/ui/button";
import { AuthHeading } from "@/components/auth/fields";
import { AcceptInvitationForm } from "./accept-form";
import { acceptInvitationAction, signOutForInvitationAction } from "./actions";

/** The token is in the path: never send it to other sites as a Referer. */
export const metadata: Metadata = { title: "Team invitation", referrer: "no-referrer", robots: { index: false, follow: false } };

const expiry = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * Invitation landing (/invitations/[token]). Unknown, expired, revoked and
 * already-used tokens all get the same generic message. Signed out → sign in
 * or create an account (email prefilled) and come back. Signed in with
 * another account → refused, with the invited address masked. Unverified →
 * verify first. Otherwise an explicit "Join" (opening the link never joins).
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, current] = await Promise.all([findInvitationByToken(token), getCurrentSession()]);
  const here = `/invitations/${encodeURIComponent(token)}`;

  if (invitation?.status === "accepted" && current && invitation.acceptedUserId === current.user.id) {
    redirect(`/home/${invitation.orgSlug}`);
  }
  if (!invitation || invitation.status !== "pending") {
    return (
      <>
        <AuthHeading title="This invitation isn't available" lead="The link is invalid or has expired. Ask a workspace owner to send you a new invitation." />
        <ButtonLink href={current ? "/home" : "/auth/sign-in"} variant="navy" size="lg" className="h-12 w-full">
          {current ? "Go to your workspaces" : "Sign in"}
        </ButtonLink>
      </>
    );
  }

  const roleArticle = invitation.role === "owner" ? "an Owner" : "a Member";
  const lead = (
    <>
      {invitation.inviterName} invited you to join <strong className="font-semibold text-navy">{invitation.orgName}</strong> on {site.name} as {roleArticle}. This invitation
      expires on {expiry.format(new Date(invitation.expiresAt))}.
    </>
  );

  if (!current) {
    const signUp = `/auth/sign-up?email=${encodeURIComponent(invitation.email)}&next=${encodeURIComponent(here)}`;
    return (
      <>
        <AuthHeading title={`Join ${invitation.orgName}`} lead={lead} />
        <div className="flex flex-col gap-3">
          <ButtonLink href={`/auth/sign-in?next=${encodeURIComponent(here)}`} variant="navy" size="lg" className="h-12 w-full">
            Sign in to accept
          </ButtonLink>
          <ButtonLink href={signUp} variant="secondary" size="lg" className="h-12 w-full">
            Create an account
          </ButtonLink>
        </div>
        <p className="mt-6 text-sm text-slate-help">Use the email address this invitation was sent to.</p>
      </>
    );
  }

  if (current.user.email !== invitation.email.toLowerCase()) {
    return (
      <>
        <AuthHeading title="This invitation is for another account" lead={`This invitation was sent to ${maskEmail(invitation.email)}. You're signed in as ${current.user.email}.`} />
        <form action={signOutForInvitationAction.bind(null, token)}>
          <Button type="submit" variant="navy" size="lg" className="h-12 w-full">
            Sign out and switch account
          </Button>
        </form>
        <p className="mt-6 text-sm text-slate-help">If you need access with this account, ask a workspace owner to invite {current.user.email}.</p>
      </>
    );
  }

  if (!current.user.emailVerifiedAt) {
    return (
      <>
        <AuthHeading title="Verify your email first" lead={<>To join {invitation.orgName}, confirm that {current.user.email} is your email address. Then open this invitation link again.</>} />
        <ButtonLink href="/auth/verify" variant="navy" size="lg" className="h-12 w-full">
          Verify your email
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={`Join ${invitation.orgName}`} lead={lead} />
      <AcceptInvitationForm acceptAction={acceptInvitationAction.bind(null, token)} workspaceName={invitation.orgName} />
      <p className="mt-6 text-sm text-slate-help">Signed in as {current.user.email}.</p>
    </>
  );
}
