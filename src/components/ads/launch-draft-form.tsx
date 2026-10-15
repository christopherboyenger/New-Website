"use client";

/**
 * Create ads — launch-draft flow (after the L38 prerequisite is met).
 *
 * Choose where the ad runs, pick an eligible post or submission, fill body
 * copy from a template, review the generated name, destination URL and CTA,
 * then "Save draft". Launching needs a provider adapter this deployment does
 * not have, so Launch stays disabled with the reason; nothing is sent to Meta
 * or TikTok and nothing is spent.
 */
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { generateAdName, resolveAdName } from "@/domain/ad-naming";
import { fillCopyTemplate, providerPlatform, resolveTrackingUrl, type AdProvider } from "@/domain/tracking-params";
import { platformLabels } from "@/domain/campaign";
import { saveLaunchDraft, type LaunchCandidate, type LaunchDraftForm as FormData } from "@/server/ads";
import { Button, ButtonLink } from "@/components/ui/button";
import { describedBy, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { ctaCatalog, ctaLabel } from "./cta-catalog";
import { providerLabels } from "./ads-display";

const allProviders: AdProvider[] = ["meta_ads", "tiktok_ads"];
const LAUNCH_REASON =
  "Launching isn't available on this deployment: no Meta or TikTok launch connection is set up for creating ads. Save a draft now; nothing is sent to the ad platform and nothing is spent.";

const radioCard =
  "flex cursor-pointer gap-3 rounded-[10px] border border-line bg-surface p-3.5 transition-colors hover:border-line-strong has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-canvas has-[:disabled]:hover:border-line";

function Step({ n, title, description, children }: { n: number; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-[12px] border border-line bg-surface p-5">
      <h2 id={`step-${n}`} className="text-[15px] font-semibold text-ink">
        <span className="mr-2 text-muted">{n}.</span>
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function LaunchDraftForm({ data }: { data: FormData }) {
  const { connection, candidates, defaults } = data;
  const [provider, setProvider] = useState<AdProvider>(connection.connected[0]);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [templateIndex, setTemplateIndex] = useState<string>("");
  const [bodyCopy, setBodyCopy] = useState("");
  const [nameOverride, setNameOverride] = useState("");
  const [cta, setCta] = useState<string>(defaults.defaultCta[providerPlatform[connection.connected[0]]] ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ adName: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const platform = providerPlatform[provider];
  const source = candidates.find((c) => `${c.kind}:${c.id}` === sourceKey) ?? null;
  const sourceEligible = source?.eligibility[provider].eligible ?? false;
  const accountName = connection.installations.find((i) => i.provider === provider)?.accountName ?? null;

  const copyValues = (c: LaunchCandidate | null) => ({
    creator: c?.creatorName ?? null,
    handle: c?.handle ? `@${c.handle}` : null,
    brand: data.org.name,
    hashtag: c?.campaignHashtag ? `#${c.campaignHashtag}` : null,
  });
  const fillFromTemplate = (index: string, c: LaunchCandidate | null) => {
    if (index === "") return;
    setBodyCopy(fillCopyTemplate(defaults.copyTemplates[Number(index)] ?? "", copyValues(c)).text);
  };
  const missingTokens = templateIndex !== "" ? fillCopyTemplate(defaults.copyTemplates[Number(templateIndex)] ?? "", copyValues(source)).missing : [];

  const generatedName = source ? generateAdName({ convention: defaults.naming, creator: source.handle ?? source.creatorName, date: new Date(data.now), postId: source.id }) : null;
  const resolvedName = generatedName ? resolveAdName(generatedName, nameOverride) : null;
  const destination = resolveTrackingUrl(defaults.links, platform);

  const chooseProvider = (p: AdProvider) => {
    setProvider(p);
    setCta(defaults.defaultCta[providerPlatform[p]] ?? "");
    if (source && !source.eligibility[p].eligible) setSourceKey(null);
  };
  const chooseSource = (key: string) => {
    setSourceKey(key);
    const c = candidates.find((x) => `${x.kind}:${x.id}` === key) ?? null;
    fillFromTemplate(templateIndex, c);
  };

  const blockers = [
    !source || !sourceEligible ? "Choose an eligible post or submission." : null,
    !bodyCopy.trim() ? "Write the body copy." : null,
    !destination.url ? "Add a website URL in Ad settings." : null,
    !cta ? "Choose a call to action." : null,
    resolvedName && !resolvedName.ok ? resolvedName.error : null,
  ].filter((b): b is string => b !== null);

  const submit = () => {
    if (!source) return;
    startTransition(async () => {
      const result = await saveLaunchDraft(data.org.slug, {
        provider,
        source: { kind: source.kind, id: source.id },
        bodyCopy,
        adNameOverride: nameOverride.trim() || null,
        cta,
        settingsVersion: data.settingsVersion,
      });
      if (result.ok) {
        setSaved({ adName: result.data.adName });
        setErrors({});
        setFormError(null);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error);
    });
  };

  if (saved) {
    return (
      <section aria-labelledby="draft-saved" className="mx-auto max-w-xl rounded-[12px] border border-line bg-surface px-6 py-10 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-8 text-success" aria-hidden="true" />
        <h2 id="draft-saved" className="text-lg font-semibold text-ink">
          Draft saved
        </h2>
        <p className="mt-2 break-all text-sm text-ink-2">{saved.adName}</p>
        <p className="mt-2 text-sm text-muted">It&apos;s saved here only. Nothing was sent to {providerLabels[provider]} and nothing was spent.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink href={`/home/${data.org.slug}/ads`} className="max-md:min-h-11">
            View in Ads
          </ButtonLink>
          <Button
            variant="secondary"
            className="max-md:min-h-11"
            onClick={() => {
              setSaved(null);
              setSourceKey(null);
              setBodyCopy("");
              setTemplateIndex("");
              setNameOverride("");
            }}
          >
            Create another
          </Button>
        </div>
      </section>
    );
  }

  const ctaId = "draft-cta";
  const copyId = "draft-copy";
  const templateId = "draft-template";
  const nameId = "draft-name-override";
  const posts = candidates.filter((c) => c.kind === "post");
  const submissions = candidates.filter((c) => c.kind === "submission");

  const renderCandidate = (c: LaunchCandidate) => {
    const key = `${c.kind}:${c.id}`;
    const e = c.eligibility[provider];
    const reasonId = `reason-${c.id}`;
    return (
      <li key={key}>
        <label className={radioCard}>
          <input
            type="radio"
            name="source"
            className="mt-1 accent-ink"
            checked={sourceKey === key}
            disabled={!e.eligible}
            aria-describedby={e.reason ? reasonId : undefined}
            onChange={() => chooseSource(key)}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-ink">{c.creatorName}</span>
              {c.handle ? <span className="text-muted">@{c.handle}</span> : null}
              {c.platform ? <span className="text-muted">· {platformLabels[c.platform]}</span> : null}
            </span>
            {c.caption ? <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{c.caption}</span> : null}
            <span className="mt-1 block text-xs text-muted">{c.rightsSummary}</span>
            {e.reason ? (
              <span id={reasonId} className="mt-1 flex items-center gap-1 text-xs text-warning">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                Not eligible: {e.reason}
              </span>
            ) : null}
          </span>
        </label>
      </li>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <Step n={1} title="Where the ad runs">
          <fieldset>
            <legend className="sr-only">Ad platform</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {allProviders.map((p) => {
                const connected = connection.connected.includes(p);
                const install = connection.installations.find((i) => i.provider === p);
                return (
                  <label key={p} className={radioCard}>
                    <input type="radio" name="provider" className="mt-1 accent-ink" checked={provider === p} disabled={!connected} onChange={() => chooseProvider(p)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{providerLabels[p]}</span>
                      <span className="block text-[13px] text-muted">
                        {connected
                          ? install?.accountName
                            ? `Ad account: ${install.accountName}`
                            : "Connected, no ad account selected"
                          : install
                            ? "Connection needs attention in Integrations"
                            : "Not connected"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-3 text-[13px] text-muted">Campaign, ad set and ad group selection happens when launching, which isn&apos;t available on this deployment yet.</p>
        </Step>

        <Step
          n={2}
          title="Post or submission"
          description="Only content with paid-use rights recorded from the creator can run as an ad. Approving a post for organic use doesn't grant paid-use rights."
        >
          {errors.source ? <p className="mb-3 text-[13px] text-danger">{errors.source}</p> : null}
          {candidates.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              No approved posts or direct submissions yet. Approved posts and accepted submissions appear here.
            </p>
          ) : (
            <fieldset className="space-y-5">
              <legend className="sr-only">Content to run as an ad</legend>
              {[
                { title: "Approved posts", items: posts },
                { title: "Direct submissions", items: submissions },
              ].map((group) =>
                group.items.length ? (
                  <div key={group.title}>
                    <h3 className="mb-2 text-sm font-medium text-ink">{group.title}</h3>
                    {(() => {
                      const eligible = group.items.filter((c) => c.eligibility[provider].eligible);
                      const ineligible = group.items.filter((c) => !c.eligibility[provider].eligible);
                      return (
                        <>
                          {eligible.length ? (
                            <ul className="space-y-2">{eligible.map(renderCandidate)}</ul>
                          ) : (
                            <p className="text-[13px] text-muted">None eligible for {providerLabels[provider]}.</p>
                          )}
                          {ineligible.length ? (
                            <details className="mt-2 rounded-[10px] border border-line">
                              <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] text-ink-2 max-md:min-h-11">
                                Not eligible for {providerLabels[provider]} ({ineligible.length})
                              </summary>
                              <ul className="space-y-2 px-2 pb-2">{ineligible.map(renderCandidate)}</ul>
                            </details>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ) : null,
              )}
            </fieldset>
          )}
        </Step>

        <Step n={3} title="Body copy">
          <div className="space-y-4">
            {defaults.copyTemplates.length ? (
              <Field id={templateId} label="Start from a template" optional>
                <Select
                  id={templateId}
                  value={templateIndex}
                  onChange={(e) => {
                    setTemplateIndex(e.target.value);
                    fillFromTemplate(e.target.value, source);
                  }}
                >
                  <option value="">Write my own</option>
                  {defaults.copyTemplates.map((t, i) => (
                    <option key={i} value={String(i)}>
                      Template {i + 1}: {t.length > 60 ? `${t.slice(0, 60)}…` : t}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-[13px] text-muted">
                No copy templates yet. Owners can add them in{" "}
                <Link href={`/home/${data.org.slug}/ad-settings`} className="underline underline-offset-2 hover:text-ink">
                  Ad settings
                </Link>
                .
              </p>
            )}
            <Field id={copyId} label="Body copy" description="Tokens from the template are replaced with this post's details." error={errors.bodyCopy}>
              <Textarea id={copyId} rows={4} value={bodyCopy} onChange={(e) => setBodyCopy(e.target.value)} {...describedBy(copyId, { description: true, error: errors.bodyCopy })} />
            </Field>
            {missingTokens.length && source ? (
              <InlineAlert tone="warning">
                This {source.kind} has no value for {missingTokens.map((t) => `{{${t}}}`).join(", ")}, so the token was left out. Check the copy reads well.
              </InlineAlert>
            ) : null}
          </div>
        </Step>

        <Step n={4} title="Name, link and button">
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-ink">Generated ad name</p>
              <p className="mt-1 break-all font-mono text-[13px] text-ink-2">{generatedName ?? "Choose a post or submission to generate the name."}</p>
            </div>
            <Field id={nameId} label="Ad name override" optional description="Leave blank to use the naming convention from Ad settings." error={errors.adNameOverride ?? (resolvedName && !resolvedName.ok ? resolvedName.error : undefined)}>
              <Input
                id={nameId}
                value={nameOverride}
                onChange={(e) => setNameOverride(e.target.value)}
                {...describedBy(nameId, { description: true, error: errors.adNameOverride ?? (resolvedName && !resolvedName.ok ? resolvedName.error : undefined) })}
              />
            </Field>
            <div>
              <p className="text-sm font-medium text-ink">Destination URL ({providerLabels[provider]})</p>
              {destination.url ? (
                <p className="mt-1 break-all font-mono text-[13px] text-ink-2">{destination.url}</p>
              ) : (
                <p className="mt-1 text-[13px] text-danger">
                  No website URL in{" "}
                  <Link href={`/home/${data.org.slug}/ad-settings`} className="underline underline-offset-2">
                    Ad settings
                  </Link>{" "}
                  yet. An owner needs to add one before drafts can be saved.
                </p>
              )}
              {destination.omitted.length ? <p className="mt-1 text-[13px] text-muted">Left out for {providerLabels[provider]}: {destination.omitted.map((o) => o.key).join(", ")} (Meta-only macro).</p> : null}
            </div>
            <Field id={ctaId} label="Call to action" error={errors.cta} className="max-w-sm">
              <Select id={ctaId} value={cta} onChange={(e) => setCta(e.target.value)} {...describedBy(ctaId, { error: errors.cta })}>
                <option value="">Choose a {providerLabels[provider]} button</option>
                {ctaCatalog[platform].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Step>
      </div>

      <aside aria-labelledby="review-title" className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-[12px] border border-line bg-surface p-5">
          <h2 id="review-title" className="text-[15px] font-semibold text-ink">
            Review
          </h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <ReviewRow label="Platform">
              {providerLabels[provider]}
              {accountName ? ` · ${accountName}` : ""}
            </ReviewRow>
            <ReviewRow label="Content">{source ? `${source.creatorName}${source.handle ? ` (@${source.handle})` : ""} · ${source.kind === "post" ? "Post" : "Submission"}` : null}</ReviewRow>
            <ReviewRow label="Rights">{source?.rightsSummary ?? null}</ReviewRow>
            <ReviewRow label="Ad name" mono>
              {resolvedName?.ok ? resolvedName.name : null}
            </ReviewRow>
            <ReviewRow label="Body copy">{bodyCopy.trim() || null}</ReviewRow>
            <ReviewRow label="Link" mono>
              {destination.url}
            </ReviewRow>
            <ReviewRow label="Button">{ctaLabel(platform, cta || null)}</ReviewRow>
            <ReviewRow label="Budget and schedule">Set when launching</ReviewRow>
          </dl>

          <div className="mt-5 space-y-3">
            <FormError message={formError} />
            <Button className="w-full max-md:min-h-11" onClick={submit} loading={pending} disabled={blockers.length > 0} aria-describedby={blockers.length ? "draft-blockers" : undefined}>
              Save draft
            </Button>
            {blockers.length ? (
              <ul id="draft-blockers" className="list-disc space-y-0.5 pl-5 text-xs text-muted">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            <Button variant="secondary" className="w-full max-md:min-h-11" disabled aria-describedby="launch-reason">
              Launch
            </Button>
            <NotConfiguredNotice title="Launch isn't available">
              <span id="launch-reason">{LAUNCH_REASON}</span>
            </NotConfiguredNotice>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ReviewRow({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("break-words text-ink", mono && "break-all font-mono text-[12px]", empty && "text-subtle")}>{empty ? "Not set" : children}</dd>
    </div>
  );
}
