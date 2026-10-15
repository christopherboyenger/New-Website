"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { AlertTriangle, Bot, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { describedBy, Field, FormError, Input, Select } from "@/components/ui/form";
import { Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/action-result";
import type { ApiGrantView, CreatedGrant } from "@/server/api-grants";
import { CopyableValue, CopyButton, IntegrationCard } from "./card-parts";
import { formatUtc, formatUtcDate } from "./labels";
import { useStepUp } from "./step-up";

/** AI assistant (MCP): this product's MCP server isn't deployed, so there is no URL or code to hand out. */
export function McpCard({ productName, configured, detail }: { productName: string; configured: boolean; detail: string }) {
  return (
    <IntegrationCard
      id="mcp"
      icon={<Bot className="size-4" />}
      title="Connect an AI assistant (MCP)"
      description={`Let an AI assistant read your ${productName} reporting data through this product's own MCP server, with every change previewed and confirmed before it applies.`}
      status={configured ? undefined : "not_configured"}
    >
      {configured ? (
        <p className="text-sm text-ink-2">{detail}</p>
      ) : (
        <NotConfiguredNotice title="The MCP server isn't deployed yet">
          {productName}&apos;s MCP server and its sign-in aren&apos;t available on this deployment, so there&apos;s no server URL or connection code to add to an AI
          client. For programmatic access today, use the Reporting API below.
        </NotConfiguredNotice>
      )}
    </IntegrationCard>
  );
}

export interface DeveloperCardProps {
  orgId: string;
  apiBaseUrl: string;
  referenceHref: string;
  /** null when the viewer can't manage tokens (metadata is owner-only). */
  grants: ApiGrantView[] | null;
  blockedReason: string | null;
  scopes: Array<{ value: string; description: string }>;
  createToken: (input: { label: string; scopes: string[]; expiry: string }) => Promise<ActionResult<CreatedGrant>>;
  revokeToken: (input: { id: string }) => Promise<ActionResult<{ id: string }>>;
}

const statusTone = { active: "success", expired: "neutral", revoked: "neutral" } as const;
const statusText = { active: "Active", expired: "Expired", revoked: "Revoked" } as const;

/** Reporting API: organization identifier, base URL and the token list (shown-once creation, confirmed revocation). */
export function DeveloperCard({ orgId, apiBaseUrl, referenceHref, grants, blockedReason, scopes, createToken, revokeToken }: DeveloperCardProps) {
  const id = useId();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedGrant | null>(null);
  const [revoking, setRevoking] = useState<ApiGrantView | null>(null);

  return (
    <section id="developer" className="scroll-mt-6 rounded-[12px] border border-line bg-surface" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-line bg-canvas text-ink-2" aria-hidden="true">
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-[15px] font-semibold text-ink">
              Developer
            </h2>
            <p className="mt-1 text-sm text-muted">
              Credentials for the read-only Reporting API. Send a token as <code className="font-mono text-[12.5px] text-ink-2">Authorization: Bearer &lt;token&gt;</code>
              ; the token decides the organization. See the{" "}
              <Link href={referenceHref} className="text-ink underline underline-offset-2 hover:text-ink-2">
                API reference
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <CopyableValue id={`${id}-org`} label="Organization ID" value={orgId} />
          <CopyableValue id={`${id}-base`} label="API base URL" value={apiBaseUrl} />
        </div>

        {grants === null ? (
          <p className="text-sm text-muted">Only workspace owners can create, view or revoke API tokens.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">API tokens</h3>
              <Button size="sm" className="max-md:min-h-11" disabled={Boolean(blockedReason)} onClick={() => setCreating(true)}>
                Create token
              </Button>
            </div>
            {blockedReason ? <p className="text-[13px] text-muted">{blockedReason}</p> : null}
            {grants.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No API tokens yet. Create one to call the Reporting API.</p>
            ) : (
              <TableScroll label="API tokens">
                <Table>
                  <THead>
                    <tr>
                      <TH>Name</TH>
                      <TH>Token</TH>
                      <TH>Scopes</TH>
                      <TH>Created</TH>
                      <TH>Last used</TH>
                      <TH>Expires</TH>
                      <TH>Status</TH>
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    </tr>
                  </THead>
                  <tbody>
                    {grants.map((g) => (
                      <TR key={g.id}>
                        <TD className="font-medium text-ink">{g.label}</TD>
                        <TD>
                          <code className="font-mono text-[12.5px]">{g.tokenPrefix}_…</code>
                        </TD>
                        <TD>
                          <span className="font-mono text-[12px]">{g.scopes.join(", ")}</span>
                        </TD>
                        <TD>
                          <span className="block whitespace-nowrap">{formatUtcDate(g.createdAt)}</span>
                          <span className="block text-[12px] text-muted">{g.createdBy}</span>
                        </TD>
                        <TD className="whitespace-nowrap">{g.lastUsedAt ? formatUtc(g.lastUsedAt) : "Never"}</TD>
                        <TD className="whitespace-nowrap">{g.expiresAt ? formatUtcDate(g.expiresAt) : "Never"}</TD>
                        <TD>
                          <Badge tone={statusTone[g.status]}>{statusText[g.status]}</Badge>
                        </TD>
                        <TD className="text-right">
                          {g.status === "active" ? (
                            <Button variant="ghost" size="sm" className="max-md:min-h-11" disabled={Boolean(blockedReason)} onClick={() => setRevoking(g)} aria-label={`Revoke ${g.label}`}>
                              Revoke
                            </Button>
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            )}
          </div>
        )}
      </div>

      <CreateTokenDialog
        open={creating}
        scopes={scopes}
        onClose={() => setCreating(false)}
        createToken={createToken}
        onCreated={(result) => {
          setCreating(false);
          setCreated(result);
        }}
      />
      <TokenShownOnceDialog created={created} onClose={() => setCreated(null)} />
      <RevokeTokenDialog grant={revoking} onClose={() => setRevoking(null)} revokeToken={revokeToken} />
    </section>
  );
}

function CreateTokenDialog({
  open,
  scopes,
  onClose,
  onCreated,
  createToken,
}: {
  open: boolean;
  scopes: DeveloperCardProps["scopes"];
  onClose: () => void;
  onCreated: (created: CreatedGrant) => void;
  createToken: DeveloperCardProps["createToken"];
}) {
  const id = useId();
  const router = useRouter();
  const { run } = useStepUp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await run(() =>
      createToken({ label: String(data.get("label") ?? ""), scopes: data.getAll("scopes").map(String), expiry: String(data.get("expiry") ?? "") }),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onCreated(result.data);
    router.refresh();
  }

  const close = () => {
    setError(null);
    setFieldErrors({});
    onClose();
  };
  const scopeError = fieldErrors.scopes ?? Object.entries(fieldErrors).find(([k]) => k.startsWith("scopes."))?.[1];
  return (
    <Dialog open={open} onClose={close} title="Create API token" description="Tokens are read-only and limited to the scopes you choose. The token is shown once.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Field id={`${id}-label`} label="Name" description="Where the token is used, e.g. “Data warehouse sync”." error={fieldErrors.label}>
          <Input id={`${id}-label`} name="label" maxLength={60} autoComplete="off" required {...describedBy(`${id}-label`, { description: true, error: fieldErrors.label })} />
        </Field>
        <fieldset className="flex flex-col gap-2" aria-describedby={scopeError ? `${id}-scopes-error` : undefined}>
          <legend className="mb-1 text-sm font-medium text-ink">Scopes</legend>
          {scopes.map((s, i) => (
            <label key={s.value} className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="scopes" value={s.value} defaultChecked={i === 0} className="mt-0.5 size-4 rounded border-line-strong accent-ink" />
              <span>
                <code className="font-mono text-[12.5px]">{s.value}</code>
                <span className="block text-[13px] text-muted">{s.description}</span>
              </span>
            </label>
          ))}
          {scopeError ? (
            <p id={`${id}-scopes-error`} className="text-[13px] text-danger">
              {scopeError}
            </p>
          ) : null}
        </fieldset>
        <Field id={`${id}-expiry`} label="Expires" error={fieldErrors.expiry}>
          <Select id={`${id}-expiry`} name="expiry" defaultValue="90" className="sm:max-w-56" {...describedBy(`${id}-expiry`, { error: fieldErrors.expiry })}>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In 1 year</option>
            <option value="never">Never</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Create token
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function TokenShownOnceDialog({ created, onClose }: { created: CreatedGrant | null; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog open={created !== null} onClose={onClose} title="Copy your new token" footer={<Button onClick={onClose}>Done</Button>}>
      {created ? (
        <div className="flex flex-col gap-3">
          <InlineAlert tone="warning" title="This is the only time the token is shown">
            Store it somewhere safe now. If you lose it, revoke it and create a new one.
          </InlineAlert>
          <div className="flex flex-col gap-1.5">
            <span id={id} className="text-[13px] font-medium text-ink">
              {created.grant.label}
            </span>
            <code aria-labelledby={id} className="break-all rounded-[8px] bg-selected px-3 py-2 font-mono text-[12.5px] text-ink">
              {created.token}
            </code>
            <div>
              <CopyButton value={created.token} label="Copy token" />
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-[13px] text-muted">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Treat it like a password: anyone with it can read this workspace&apos;s reports within its scopes ({created.grant.scopes.join(", ")}).
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

function RevokeTokenDialog({
  grant,
  onClose,
  revokeToken,
}: {
  grant: ApiGrantView | null;
  onClose: () => void;
  revokeToken: DeveloperCardProps["revokeToken"];
}) {
  const router = useRouter();
  const { run } = useStepUp();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <Dialog
      open={grant !== null}
      onClose={close}
      size="sm"
      title={grant ? `Revoke “${grant.label}”?` : "Revoke token?"}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              if (!grant) return;
              setBusy(true);
              setError(null);
              const result = await run(() => revokeToken({ id: grant.id }));
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              notify(result.message ?? "Token revoked.", "success");
              close();
              router.refresh();
            }}
          >
            Revoke token
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink-2">
        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
        <p>Anything using this token stops working immediately. This can&apos;t be undone.</p>
      </div>
    </Dialog>
  );
}
