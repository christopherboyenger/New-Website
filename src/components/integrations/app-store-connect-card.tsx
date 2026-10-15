"use client";

import { useId, useState, type FormEvent } from "react";
import { Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { describedBy, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/action-result";
import type { AppStoreConnectResult } from "@/server/integrations/app-store-connect";
import type { IntegrationOverview } from "@/server/integrations/installations";
import { DisconnectButton, InstallationDetails, IntegrationCard, StepsList } from "./card-parts";
import { errorMessage } from "./labels";
import { useStepUp } from "./step-up";

export interface AppStoreConnectCardProps {
  productName: string;
  overview: IntegrationOverview;
  canManage: boolean;
  blockedReason: string | null;
  defaultOpen: boolean;
  connect: (input: { issuerId: string; keyId: string; privateKey: string }) => Promise<ActionResult<AppStoreConnectResult>>;
  disconnect: () => Promise<ActionResult<{ outcome: "disconnected" | "revocation_pending" }>>;
}

export function AppStoreConnectCard({ productName, overview, canManage, blockedReason, defaultOpen, connect, disconnect }: AppStoreConnectCardProps) {
  const installation = overview.installation;
  const live = installation && installation.status !== "disconnected";
  const keyStored = live && installation.status !== "error";
  const [replacing, setReplacing] = useState(false);
  const showForm = overview.configured && (!keyStored || replacing);

  return (
    <IntegrationCard
      id="app_store_connect"
      icon={<Smartphone className="size-4" />}
      title="App Store Connect"
      description={`Connect your Apple developer account so ${productName} can import your app's App Store install reports, including where installs came from.`}
      status={overview.displayStatus}
      summary={keyStored ? `Key ${installation.publicConfig.keyId ?? ""} · ${installation.selectedAssets.length} app${installation.selectedAssets.length === 1 ? "" : "s"} visible` : undefined}
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col gap-5">
        {!overview.configured ? (
          <NotConfiguredNotice title="Private keys can't be accepted on this deployment">
            Secure credential storage isn&apos;t configured, so {productName} won&apos;t accept an App Store Connect key here. An administrator of this deployment
            needs to set up credential encryption first.
          </NotConfiguredNotice>
        ) : null}

        {installation && live ? (
          <InstallationDetails
            installation={installation}
            assetLabel="Apps this key can read"
            extra={[
              ["Issuer ID", <span key="iss" className="font-mono text-[12.5px]">{installation.publicConfig.issuerId ?? "—"}</span>],
              ["Key ID", <span key="kid" className="font-mono text-[12.5px]">{installation.publicConfig.keyId ?? "—"}</span>],
              ["Private key", keyStored ? "Stored encrypted · never shown again" : "Not kept (verification failed)"],
            ]}
          />
        ) : null}

        {showForm ? (
          <>
            <StepsList>
              <li>In App Store Connect, open Users and Access, then Integrations.</li>
              <li>
                Create a Team API key with the <strong className="font-semibold text-ink">Sales and Reports</strong> role (read-only) and download the .p8 file.
              </li>
              <li>Paste the Issuer ID, Key ID and the .p8 contents below.</li>
            </StepsList>
            <AppStoreConnectForm canManage={canManage} blockedReason={blockedReason} connect={connect} onDone={() => setReplacing(false)} />
          </>
        ) : null}

        {canManage && live ? (
          <div className="flex flex-wrap gap-2">
            {keyStored && overview.configured && !replacing ? (
              <Button variant="secondary" size="sm" className="max-md:min-h-11" disabled={Boolean(blockedReason)} onClick={() => setReplacing(true)}>
                Replace key
              </Button>
            ) : null}
            <DisconnectButton
              providerName="App Store Connect"
              disconnect={disconnect}
              disabled={Boolean(blockedReason)}
              consequence={
                <p>
                  The stored key is destroyed here immediately and App Store reports stop importing. To fully revoke access, also revoke the key in App Store
                  Connect (Users and Access → Integrations).
                </p>
              }
            />
          </div>
        ) : null}
        {blockedReason && canManage ? <p className="text-[13px] text-muted">{blockedReason}</p> : null}
      </div>
    </IntegrationCard>
  );
}

function AppStoreConnectForm({
  canManage,
  blockedReason,
  connect,
  onDone,
}: {
  canManage: boolean;
  blockedReason: string | null;
  connect: AppStoreConnectCardProps["connect"];
  onDone: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const { run } = useStepUp();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const disabled = !canManage || Boolean(blockedReason);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    setVerifyError(null);
    setFieldErrors({});
    const result = await run(() =>
      connect({ issuerId: String(data.get("issuerId") ?? ""), keyId: String(data.get("keyId") ?? ""), privateKey: String(data.get("privateKey") ?? "") }),
    );
    setBusy(false);
    // The private key is never kept in the form after a submission, whatever the outcome.
    const keyField = form.elements.namedItem("privateKey") as HTMLTextAreaElement | null;
    if (keyField) keyField.value = "";
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    if (result.data.status === "connected") {
      form.reset();
      notify(result.message ?? "Key verified.", "success");
      onDone();
    } else {
      setVerifyError(errorMessage(result.data.errorCategory) ?? "Verification failed.");
    }
    router.refresh();
  }

  const f = (name: string) => `${id}-${name}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      {verifyError ? (
        <InlineAlert tone="danger" title="Apple didn't accept this key">
          {verifyError} The key was not kept; paste it again to retry.
        </InlineAlert>
      ) : null}
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <Field id={f("issuer")} label="Issuer ID" error={fieldErrors.issuerId}>
          <Input id={f("issuer")} name="issuerId" placeholder="69a6de70-…" autoComplete="off" spellCheck={false} className="font-mono" {...describedBy(f("issuer"), { error: fieldErrors.issuerId })} />
        </Field>
        <Field id={f("key")} label="Key ID" error={fieldErrors.keyId}>
          <Input id={f("key")} name="keyId" placeholder="A1B2C3D4E5" autoComplete="off" spellCheck={false} maxLength={10} className="font-mono sm:max-w-56" {...describedBy(f("key"), { error: fieldErrors.keyId })} />
        </Field>
        <Field id={f("p8")} label="Private key (.p8 contents)" description="Sent once over HTTPS, stored encrypted, and never shown again." error={fieldErrors.privateKey}>
          <Textarea
            id={f("p8")}
            name="privateKey"
            placeholder={"-----BEGIN PRIVATE KEY-----\n…"}
            autoComplete="off"
            spellCheck={false}
            rows={5}
            className="font-mono text-[12.5px]"
            {...describedBy(f("p8"), { description: true, error: fieldErrors.privateKey })}
          />
        </Field>
        <div>
          <Button type="submit" loading={busy} className="max-md:min-h-11">
            Validate key
          </Button>
        </div>
      </fieldset>
      {!canManage ? <p className="text-[13px] text-muted">Only workspace owners can connect App Store Connect.</p> : null}
    </form>
  );
}
