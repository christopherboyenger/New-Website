"use client";

import { useId, useState, type FormEvent } from "react";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { describedBy, Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/action-result";
import type { IntegrationOverview } from "@/server/integrations/installations";
import { CopyButton, DisconnectButton, InstallationDetails, IntegrationCard, StepsList } from "./card-parts";
import { useStepUp } from "./step-up";

export interface GooglePlayCardProps {
  productName: string;
  overview: IntegrationOverview;
  serviceAccountEmail: string | null;
  canManage: boolean;
  blockedReason: string | null;
  defaultOpen: boolean;
  connect: (input: { packageName: string; bucketId: string }) => Promise<ActionResult<{ status: "verifying" }>>;
  disconnect: () => Promise<ActionResult<{ outcome: "disconnected" | "revocation_pending" }>>;
}

export function GooglePlayCard({ productName, overview, serviceAccountEmail, canManage, blockedReason, defaultOpen, connect, disconnect }: GooglePlayCardProps) {
  const installation = overview.installation;
  const live = installation && installation.status !== "disconnected";
  const [editing, setEditing] = useState(false);
  const showForm = !live || editing;

  return (
    <IntegrationCard
      id="google_play"
      icon={<Play className="size-4" />}
      title="Google Play"
      description={`Connect your Google Play developer account so ${productName} can import your app's Play Store install reports. No keys to share: you invite this product's read-only service account instead.`}
      status={overview.displayStatus}
      summary={live ? installation.publicConfig.packageName : undefined}
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col gap-5">
        {!serviceAccountEmail ? (
          <NotConfiguredNotice title={`This product's Google Play reporting identity isn't configured`}>
            There is no service account for you to invite yet, so Google Play can&apos;t be connected on this deployment.
          </NotConfiguredNotice>
        ) : null}

        {installation && live ? (
          <>
            {installation.status === "verifying" ? (
              <InlineAlert tone="info" title="Awaiting verification">
                Your package name and bucket are saved. Verifying access needs {productName}&apos;s Google Cloud credentials, which aren&apos;t configured on this
                deployment yet, so no reports are read and this integration is not connected.
              </InlineAlert>
            ) : null}
            <InstallationDetails
              installation={installation}
              extra={[
                ["Package name", <span key="pkg" className="font-mono text-[12.5px]">{installation.publicConfig.packageName ?? "—"}</span>],
                ["Report bucket ID", <span key="bkt" className="break-all font-mono text-[12.5px]">{installation.publicConfig.bucketId ?? "—"}</span>],
              ]}
            />
          </>
        ) : null}

        {showForm && serviceAccountEmail ? (
          <>
            <StepsList>
              <li>
                In Play Console, open Users and permissions and invite this service account with the account-level permission{" "}
                <strong className="font-semibold text-ink">&ldquo;View app information and download bulk reports&rdquo;</strong>:
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-[6px] bg-selected px-2 py-1 font-mono text-[12.5px] text-ink">{serviceAccountEmail}</code>
                  <CopyButton value={serviceAccountEmail} />
                </span>
              </li>
              <li>
                In Play Console, open Download reports (Statistics) and copy the Cloud Storage URI — the part starting with{" "}
                <code className="font-mono text-[12.5px]">pubsite_prod_</code>.
              </li>
              <li>Enter your app&apos;s package name and that bucket ID below.</li>
            </StepsList>
            <GooglePlayForm canManage={canManage} blockedReason={blockedReason} connect={connect} onDone={() => setEditing(false)} />
          </>
        ) : null}

        {canManage && live ? (
          <div className="flex flex-wrap gap-2">
            {!editing && serviceAccountEmail ? (
              <Button variant="secondary" size="sm" className="max-md:min-h-11" disabled={Boolean(blockedReason)} onClick={() => setEditing(true)}>
                Change package or bucket
              </Button>
            ) : null}
            <DisconnectButton
              providerName="Google Play"
              disconnect={disconnect}
              disabled={Boolean(blockedReason)}
              consequence={<p>The package and bucket mapping is removed and Play Store reports stop importing. You can also remove the service account in Play Console.</p>}
            />
          </div>
        ) : null}
        {blockedReason && canManage ? <p className="text-[13px] text-muted">{blockedReason}</p> : null}
      </div>
    </IntegrationCard>
  );
}

function GooglePlayForm({
  canManage,
  blockedReason,
  connect,
  onDone,
}: {
  canManage: boolean;
  blockedReason: string | null;
  connect: GooglePlayCardProps["connect"];
  onDone: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const { run } = useStepUp();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await run(() => connect({ packageName: String(data.get("packageName") ?? ""), bucketId: String(data.get("bucketId") ?? "") }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    form.reset();
    notify("Saved. Verification is pending.", "neutral");
    onDone();
    router.refresh();
  }

  const f = (name: string) => `${id}-${name}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <fieldset disabled={!canManage || Boolean(blockedReason)} className="flex flex-col gap-4">
        <Field id={f("pkg")} label="Package name" error={fieldErrors.packageName}>
          <Input id={f("pkg")} name="packageName" placeholder="com.example.app" autoComplete="off" spellCheck={false} className="font-mono sm:max-w-sm" {...describedBy(f("pkg"), { error: fieldErrors.packageName })} />
        </Field>
        <Field id={f("bucket")} label="Report bucket ID" description="Paste the bucket ID or the whole gs:// URI; only the bucket is kept." error={fieldErrors.bucketId}>
          <Input
            id={f("bucket")}
            name="bucketId"
            placeholder="pubsite_prod_1234567890123456789"
            autoComplete="off"
            spellCheck={false}
            className="font-mono sm:max-w-sm"
            {...describedBy(f("bucket"), { description: true, error: fieldErrors.bucketId })}
          />
        </Field>
        <div>
          <Button type="submit" loading={busy} className="max-md:min-h-11">
            Connect
          </Button>
        </div>
      </fieldset>
      {!canManage ? <p className="text-[13px] text-muted">Only workspace owners can connect Google Play.</p> : null}
    </form>
  );
}
