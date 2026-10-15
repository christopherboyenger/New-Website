"use client";

/**
 * The four Ad settings panels. Each edits one slice of the shared draft; the
 * parent owns Save. Previews use clearly labelled example values, never real
 * creators or posts.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Lock, Plus, X } from "lucide-react";
import {
  MAX_CUSTOM_TEXT,
  MAX_NAMING_FIELDS,
  moveField,
  namingExample,
  namingFieldLabels,
  namingSeparatorLabels,
  namingSeparators,
  namingTemplate,
  POST_ID_LABEL,
  type NamingField,
} from "@/domain/ad-naming";
import {
  adPlatformLabels,
  adPlatforms,
  copyExampleValues,
  copyTokens,
  fillCopyTemplate,
  MAX_COPY_TEMPLATES,
  MAX_URL_PARAMS,
  resolveTrackingUrl,
} from "@/domain/tracking-params";
import type { AdDefaults } from "@/server/ad-settings";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ctaCatalog } from "./cta-catalog";

export interface PanelProps {
  settings: AdDefaults;
  update: (patch: Partial<AdDefaults>) => void;
  errors: Record<string, string>;
  idPrefix: string;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
    </div>
  );
}

const iconButton = "inline-flex size-9 items-center justify-center rounded-[8px] text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40 max-md:size-11";

/* ------------------------------------------------------------ copy templates */

export function CopyTemplatesPanel({ settings, update, errors, idPrefix }: PanelProps) {
  const templates = settings.copyTemplates;
  const set = (next: string[]) => update({ copyTemplates: next });
  return (
    <section className="max-w-3xl">
      <SectionHeading title="Copy templates" description="The body copy an ad can use. Tokens are replaced per post when an ad draft is created." />
      {templates.length === 0 ? <p className="mb-4 rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No copy templates yet.</p> : null}
      <ol className="space-y-4">
        {templates.map((t, i) => {
          const id = `${idPrefix}-copy-${i}`;
          const error = errors[`copyTemplates.${i}`];
          const preview = fillCopyTemplate(t, copyExampleValues);
          return (
            <li key={i} className="rounded-[10px] border border-line bg-surface p-4">
              <div className="flex items-start gap-2">
                <Field id={id} label={`Template ${i + 1}`} error={error} className="min-w-0 flex-1">
                  <Textarea id={id} value={t} rows={3} onChange={(e) => set(templates.map((x, j) => (j === i ? e.target.value : x)))} {...describedBy(id, { error })} />
                </Field>
                <button type="button" className={`${iconButton} mt-6`} aria-label={`Remove template ${i + 1}`} onClick={() => set(templates.filter((_, j) => j !== i))}>
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              {t.trim() ? (
                <p className="mt-2 text-[13px] text-muted">
                  <span className="font-medium text-ink-2">Preview with example values:</span> {preview.text || "—"}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" size="sm" className="mt-4 max-md:min-h-11" disabled={templates.length >= MAX_COPY_TEMPLATES} onClick={() => set([...templates, ""])}>
        <Plus className="size-3.5" aria-hidden="true" />
        Add template
      </Button>
      {templates.length >= MAX_COPY_TEMPLATES ? <p className="mt-2 text-xs text-muted">You can keep up to {MAX_COPY_TEMPLATES} templates.</p> : null}

      <div className="mt-8">
        <h3 className="text-sm font-medium text-ink">Tokens</h3>
        <p className="mt-1 text-[13px] text-muted">Type a token into a template. Example values below are placeholders for the preview only.</p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr_1fr]">
          {copyTokens.map((t) => (
            <div key={t.token} className="contents">
              <dt>
                <code className="rounded bg-selected px-1.5 py-0.5 text-[13px] text-ink">{`{{${t.token}}}`}</code>
              </dt>
              <dd className="text-ink-2">{t.label}</dd>
              <dd className="text-muted max-sm:mb-2">Example: {t.example}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- naming conventions */

export function NamingPanel({ settings, update, errors, idPrefix }: PanelProps) {
  const { fields, separator } = settings.naming;
  const [announcement, setAnnouncement] = useState("");
  const setFields = (next: NamingField[]) => update({ naming: { ...settings.naming, fields: next } });
  const label = (f: NamingField) => namingFieldLabels[f.kind];
  const has = (kind: NamingField["kind"]) => fields.some((f) => f.kind === kind);
  const full = fields.length >= MAX_NAMING_FIELDS;

  const move = (i: number, dir: -1 | 1) => {
    setFields(moveField(fields, i, dir));
    setAnnouncement(`${label(fields[i])} moved to position ${i + dir + 1} of ${fields.length}.`);
  };
  const sepId = `${idPrefix}-separator`;
  const fieldsError = errors["naming.fields"];

  return (
    <section className="max-w-3xl">
      <SectionHeading title="Ad name" description="The name of the ad here and in Meta and TikTok Ads Manager." />

      <h3 className="mb-2 text-sm font-medium text-ink">Order</h3>
      <ol className="space-y-2" aria-label="Name fields in order">
        {fields.map((f, i) => {
          const customId = `${idPrefix}-custom-${i}`;
          const error = errors[`naming.fields.${i}.value`];
          return (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2">
              <span className="w-6 text-xs text-muted" aria-hidden="true">
                {i + 1}.
              </span>
              <span className="min-w-24 text-sm font-medium text-ink">{label(f)}</span>
              {f.kind === "custom" ? (
                <div className="min-w-40 flex-1">
                  <label htmlFor={customId} className="sr-only">
                    Custom text {i + 1}
                  </label>
                  <Input
                    id={customId}
                    value={f.value}
                    maxLength={MAX_CUSTOM_TEXT}
                    placeholder="e.g. Brand"
                    onChange={(e) => setFields(fields.map((x, j) => (j === i ? { kind: "custom", value: e.target.value } : x)))}
                    {...describedBy(customId, { error })}
                  />
                  {error ? (
                    <p id={`${customId}-error`} className="mt-1 text-[13px] text-danger">
                      {error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <span className="flex-1 text-[13px] text-muted">{f.kind === "date" ? "Launch-draft date, UTC (YYYYMMDD)" : "Creator handle"}</span>
              )}
              <div className="ml-auto flex items-center">
                <button type="button" className={iconButton} aria-label={`Move ${label(f)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button type="button" className={iconButton} aria-label={`Move ${label(f)} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`Remove ${label(f)}`}
                  onClick={() => {
                    setFields(fields.filter((_, j) => j !== i));
                    setAnnouncement(`${label(f)} removed.`);
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
        <li className="flex items-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-canvas px-3 py-2.5" title="Always last, so every ad traces back to its post">
          <span className="w-6 text-xs text-muted" aria-hidden="true">
            {fields.length + 1}.
          </span>
          <span className="min-w-24 text-sm font-medium text-ink">{POST_ID_LABEL}</span>
          <span className="flex-1 text-[13px] text-muted">Always last, so every ad traces back to its post</span>
          <Lock className="mr-2 size-4 text-muted" aria-label="Fixed" role="img" />
        </li>
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {fieldsError ? <p className="mt-2 text-[13px] text-danger">{fieldsError}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" className="max-md:min-h-11" disabled={full} onClick={() => setFields([...fields, { kind: "custom", value: "" }])}>
          <Plus className="size-3.5" aria-hidden="true" />
          Custom text
        </Button>
        <Button variant="secondary" size="sm" className="max-md:min-h-11" disabled={full || has("date")} onClick={() => setFields([...fields, { kind: "date" }])}>
          <Plus className="size-3.5" aria-hidden="true" />
          Date
        </Button>
        <Button variant="secondary" size="sm" className="max-md:min-h-11" disabled={full || has("creator")} onClick={() => setFields([...fields, { kind: "creator" }])}>
          <Plus className="size-3.5" aria-hidden="true" />
          Creator
        </Button>
      </div>

      <Field id={sepId} label="Separator" error={errors["naming.separator"]} className="mt-6 max-w-xs">
        <Select id={sepId} value={separator} onChange={(e) => update({ naming: { ...settings.naming, separator: e.target.value } })} {...describedBy(sepId, { error: errors["naming.separator"] })}>
          {namingSeparators.map((s) => (
            <option key={s} value={s}>
              {namingSeparatorLabels[s]}
            </option>
          ))}
        </Select>
      </Field>

      <p className="mt-6 text-sm text-ink-2">
        Names always end with the {POST_ID_LABEL}, so each ad traces back to its post. You can override the name of an individual ad when you create it.
      </p>
      <dl className="mt-4 grid gap-x-4 gap-y-2 rounded-[10px] bg-canvas px-4 py-3 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted">Template</dt>
        <dd className="break-all font-mono text-[13px] text-ink">{namingTemplate(settings.naming)}</dd>
        <dt className="text-muted">Example (sample values)</dt>
        <dd className="break-all font-mono text-[13px] text-ink">{namingExample(settings.naming)}</dd>
      </dl>
    </section>
  );
}

/* --------------------------------------------------------- links & parameters */

export function LinksPanel({ settings, update, errors, idPrefix }: PanelProps) {
  const { links } = settings;
  const urlId = `${idPrefix}-website`;
  const setParams = (params: AdDefaults["links"]["params"]) => update({ links: { ...links, params } });
  return (
    <section className="max-w-3xl">
      <SectionHeading title="Website URL" description="Where the ad sends people." />
      <Field id={urlId} label="Website URL" error={errors["links.websiteUrl"]} className="max-w-xl">
        <Input
          id={urlId}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          value={links.websiteUrl}
          onChange={(e) => update({ links: { ...links, websiteUrl: e.target.value } })}
          {...describedBy(urlId, { error: errors["links.websiteUrl"] })}
        />
      </Field>

      <div className="mt-8">
        <h3 className="text-sm font-medium text-ink">URL parameters</h3>
        <p className="mt-1 text-[13px] text-muted">
          Added to the website URL on click. Values may use <code className="rounded bg-selected px-1">{"{{platform}}"}</code> (becomes meta or tiktok) and Meta&apos;s own
          macros such as <code className="rounded bg-selected px-1">{"{{adset.id}}"}</code>. A parameter that uses a Meta macro is left out of TikTok URLs.
        </p>
        {links.params.length ? (
          <ul className="mt-3 space-y-2">
            {links.params.map((p, i) => {
              const keyId = `${idPrefix}-param-key-${i}`;
              const valueId = `${idPrefix}-param-value-${i}`;
              const keyError = errors[`links.params.${i}.key`];
              const valueError = errors[`links.params.${i}.value`];
              return (
                <li key={i} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                  <Field id={keyId} label={`Parameter ${i + 1} key`} error={keyError} className="min-w-0 flex-1 basis-40">
                    <Input
                      id={keyId}
                      value={p.key}
                      placeholder="utm_source"
                      onChange={(e) => setParams(links.params.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                      {...describedBy(keyId, { error: keyError })}
                    />
                  </Field>
                  <Field id={valueId} label={`Parameter ${i + 1} value`} error={valueError} className="min-w-0 flex-1 basis-40">
                    <Input
                      id={valueId}
                      value={p.value}
                      placeholder="{{platform}}"
                      onChange={(e) => setParams(links.params.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      {...describedBy(valueId, { error: valueError })}
                    />
                  </Field>
                  <button type="button" className={`${iconButton} sm:mt-6`} aria-label={`Remove parameter ${i + 1}`} onClick={() => setParams(links.params.filter((_, j) => j !== i))}>
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 max-md:min-h-11"
          disabled={links.params.length >= MAX_URL_PARAMS}
          onClick={() => setParams([...links.params, { key: "", value: "" }])}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add parameter
        </Button>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-medium text-ink">Resolved URL preview</h3>
        <dl className="mt-3 space-y-3">
          {adPlatforms.map((platform) => {
            const resolved = resolveTrackingUrl(links, platform);
            return (
              <div key={platform} className="rounded-[10px] bg-canvas px-4 py-3">
                <dt className="text-[13px] font-medium text-ink-2">{adPlatformLabels[platform]}</dt>
                <dd className="mt-1 break-all font-mono text-[13px] text-ink">{resolved.url ?? <span className="font-sans text-muted">Add a valid https:// website URL to see the link.</span>}</dd>
                {resolved.omitted.length ? (
                  <dd className="mt-1 text-[13px] text-muted">
                    Left out: {resolved.omitted.map((o) => `${o.key} — ${o.reason}`).join(", ")}
                  </dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- default CTA */

export function CtaPanel({ settings, update, errors, idPrefix }: PanelProps) {
  return (
    <section className="max-w-3xl">
      <SectionHeading title="Call to action" description="The button on the ad: Meta and TikTok offer different CTA options." />
      <div className="grid gap-4 sm:grid-cols-2">
        {adPlatforms.map((platform) => {
          const id = `${idPrefix}-cta-${platform}`;
          const error = errors[`defaultCta.${platform}`];
          return (
            <Field key={platform} id={id} label={adPlatformLabels[platform]} error={error}>
              <Select
                id={id}
                value={settings.defaultCta[platform] ?? ""}
                onChange={(e) => update({ defaultCta: { ...settings.defaultCta, [platform]: e.target.value || null } })}
                {...describedBy(id, { error })}
              >
                <option value="">Choose a {adPlatformLabels[platform]} button</option>
                {ctaCatalog[platform].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] text-muted">Options follow each platform&apos;s published button types. Each new ad starts with this button and can change it.</p>
    </section>
  );
}
