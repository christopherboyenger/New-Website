import type { Metadata } from "next";
import { countryOptions } from "@/domain/targeting-catalog";
import { requireCreatorPage } from "@/server/creator/context";
import { listSocialAccounts, MAX_SOCIAL_ACCOUNTS } from "@/server/creator/profile";
import { NotConfiguredNotice } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { CreatorProfileForm } from "@/components/creator/profile-form";
import { AddSocialAccountForm, SocialAccountList } from "@/components/creator/social-accounts";

export const metadata: Metadata = { title: "Profile" };

/** Creator profile and linked social accounts. */
export default async function CreatorProfilePage() {
  const ctx = await requireCreatorPage("/creator/profile");
  const accounts = await listSocialAccounts(ctx);
  const atLimit = accounts.length >= MAX_SOCIAL_ACCOUNTS;

  return (
    <>
      <h1 className="text-xl font-semibold leading-7 text-ink">Profile</h1>
      <p className="mt-1 text-sm text-muted">How brands see you, and the accounts you post from.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <Card>
          <CardHeader title="Creator profile" />
          <CardBody>
            <CreatorProfileForm displayName={ctx.creator.displayName} country={ctx.creator.country} countries={countryOptions()} />
          </CardBody>
        </Card>

        <div id="accounts" className="scroll-mt-24">
          <Card>
            <CardHeader title="Social accounts" description="Campaigns are matched to the platforms of the accounts you link." />
            <CardBody className="flex flex-col gap-5">
              <NotConfiguredNotice title="Account ownership can't be verified yet">
                Verifying that an account is yours needs a connection to the platform, which this service hasn&apos;t set up. Linked accounts stay
                &ldquo;Unverified&rdquo;: you can join campaigns and submit posts, but campaigns that require a verified dedicated account stay closed.
              </NotConfiguredNotice>
              <SocialAccountList accounts={accounts} />
              <div className="border-t border-line pt-5">
                <AddSocialAccountForm disabledReason={atLimit ? `You can link up to ${MAX_SOCIAL_ACCOUNTS} accounts. Remove one to add another.` : null} />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
