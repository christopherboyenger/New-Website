"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import type { ActionResult } from "@/server/action-result";
import type { BrandingView } from "@/server/branding";
import { Button } from "@/components/ui/button";
import { InlineAlert, NotConfiguredNotice } from "@/components/ui/feedback";
import { describedBy, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { BrandPreview } from "./brand-preview";
import { RichTextEditor } from "./rich-text-editor";

export type SaveBrandingCommand = (input: Record<string, unknown>) => Promise<ActionResult<{ branding: BrandingView }>>;

type Values = Omit<BrandingView, "version" | "hasLogo" | "hasCover">;
type LinkKey = "websiteUrl" | "appStoreUrl" | "playStoreUrl";

const linkTabs: Array<{ key: LinkKey; tab: string; label: string; placeholder: string }> = [
  { key: "websiteUrl", tab: "Website", label: "Website URL", placeholder: "https://www.example.com" },
  { key: "appStoreUrl", tab: "App Store", label: "App Store URL", placeholder: "https://apps.apple.com/app/…" },
  { key: "playStoreUrl", tab: "Android App", label: "Google Play URL", placeholder: "https://play.google.com/store/apps/details?id=…" },
];

function valuesOf(b: BrandingView): Values {
  return {
    name: b.name,
    brandHashtag: b.brandHashtag,
    categories: [...b.categories],
    brandColor: b.brandColor,
    descriptionHtml: b.descriptionHtml,
    websiteUrl: b.websiteUrl,
    appStoreUrl: b.appStoreUrl,
    playStoreUrl: b.playStoreUrl,
  };
}

/**
 * Branding form (L12) with a live creator-facing preview. Save stays disabled
 * until something changes; saves carry the loaded version, and a conflict
 * asks to reload instead of overwriting someone else's edit. Read-only (with
 * the reason) for people without `branding:edit`.
 */
export function BrandingForm({
  initial,
  canEdit,
  categories,
  maxDescription,
  defaultColor,
  mediaStorage,
  saveAction,
  dangerZone,
}: {
  initial: BrandingView;
  canEdit: boolean;
  categories: readonly string[];
  maxDescription: number;
  defaultColor: string;
  mediaStorage: { configured: boolean; detail: string };
  saveAction: SaveBrandingCommand;
  dangerZone: ReactNode;
}) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState<Values>(() => valuesOf(initial));
  const [descriptionChars, setDescriptionChars] = useState(0);
  const [activeLink, setActiveLink] = useState<LinkKey>("websiteUrl");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();
  const descriptionLabelId = useId();
  const tabRefs = useRef<Record<LinkKey, HTMLButtonElement | null>>({ websiteUrl: null, appStoreUrl: null, playStoreUrl: null });

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(valuesOf(saved)), [values, saved]);
  const overLimit = descriptionChars > maxDescription;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || !dirty || overLimit) return;
    setError(null);
    setConflict(false);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveAction({ ...values, categories: values.categories, expectedVersion: saved.version });
      if (!result.ok) {
        setError(result.error);
        setConflict(result.code === "conflict");
        const errors = result.fieldErrors ?? {};
        setFieldErrors(errors);
        const linkWithError = linkTabs.find((t) => errors[t.key]);
        if (linkWithError) setActiveLink(linkWithError.key);
        return;
      }
      setSaved(result.data.branding);
      setValues(valuesOf(result.data.branding));
      notify(result.message ?? "Branding saved.", "success");
    });
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? 0 : event.key === "End" ? linkTabs.length - 1 : delta ? (index + delta + linkTabs.length) % linkTabs.length : -1;
    if (target < 0) return;
    event.preventDefault();
    const key = linkTabs[target].key;
    setActiveLink(key);
    tabRefs.current[key]?.focus();
  }

  const err = (key: string) => fieldErrors[key];
  const categoryError = err("categories") ?? err("categories.0") ?? err("categories.1") ?? err("categories.2");
  const colorValue = /^#[0-9a-f]{6}$/i.test(values.brandColor) ? values.brandColor.toLowerCase() : defaultColor;

  return (
    <form onSubmit={save} noValidate>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-xl font-semibold leading-7 text-ink">Branding</h1>
        {canEdit ? (
          <div className="flex items-center gap-3">
            {dirty ? <span className="text-[13px] text-muted">Unsaved changes</span> : null}
            <Button type="submit" disabled={!dirty || overLimit} loading={pending} className="max-md:min-h-11">
              Save
            </Button>
          </div>
        ) : null}
      </header>

      {!canEdit ? (
        <InlineAlert tone="info" className="mb-6" title="View only">
          Only workspace owners can edit branding.
        </InlineAlert>
      ) : null}
      <div className="mb-4 space-y-2">
        <FormError message={error} />
        {conflict ? (
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Reload latest (discards your unsaved edits)
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <fieldset disabled={!canEdit || pending} className="min-w-0 space-y-8">
          <legend className="sr-only">Brand settings</legend>

          <Field id="brand-name" label="Name" description="Your brand's name." error={err("name")}>
            <Input
              id="brand-name"
              value={values.name}
              maxLength={80}
              placeholder="Enter your brand's name here"
              onChange={(e) => set("name", e.target.value)}
              {...describedBy("brand-name", { description: true, error: err("name") })}
              className="max-md:h-11"
            />
          </Field>

          <Field id="brand-hashtag" label="Brand Hashtag" description="Creators use it to attribute posts to your brand." error={err("brandHashtag")}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted" aria-hidden="true">
                #
              </span>
              <Input
                id="brand-hashtag"
                value={values.brandHashtag}
                maxLength={51}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => set("brandHashtag", e.target.value.replace(/^#/, ""))}
                {...describedBy("brand-hashtag", { description: true, error: err("brandHashtag") })}
                className="max-md:h-11"
              />
            </div>
          </Field>

          <fieldset aria-describedby="brand-categories-help" className="space-y-1.5">
            <legend className="text-sm font-medium text-ink">Categories</legend>
            <p id="brand-categories-help" className="text-[13px] text-muted">
              Pick 3 categories that best represent your brand. Creators see them on your brand page.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => {
                const others = values.categories.filter((c, j) => j !== i && c);
                return (
                  <div key={i}>
                    <label htmlFor={`brand-category-${i}`} className="sr-only">
                      Category {i + 1}
                    </label>
                    <Select
                      id={`brand-category-${i}`}
                      value={values.categories[i]}
                      onChange={(e) => {
                        const next = [...values.categories] as Values["categories"];
                        next[i] = e.target.value;
                        set("categories", next);
                      }}
                      aria-invalid={categoryError ? true : undefined}
                      aria-describedby={categoryError ? "brand-categories-error" : undefined}
                      className="max-md:h-11"
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c} value={c} disabled={others.includes(c)}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </div>
                );
              })}
            </div>
            {categoryError ? (
              <p id="brand-categories-error" className="text-[13px] text-danger">
                {categoryError}
              </p>
            ) : null}
          </fieldset>

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium text-ink">Brand Identity</h2>
              <p className="text-[13px] text-muted">Choose your brand&apos;s logo, cover image, and color. These are shown on your brand page.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ImageSlot title="Logo" guidance="Upload at least a 256 × 256 pixel PNG or JPG" shape="circle" />
              <ImageSlot title="Cover Image" guidance="Upload at least a 800 × 800 pixel PNG or JPG" shape="square" />
            </div>
            {!mediaStorage.configured ? (
              <NotConfiguredNotice title="Image uploads aren't available yet">
                {mediaStorage.detail} Your brand page uses your initials and color until uploads are enabled.
              </NotConfiguredNotice>
            ) : null}
            <Field id="brand-color" label="Color" description="Used for your brand page accents." error={err("brandColor")}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick brand color"
                  value={colorValue}
                  onChange={(e) => set("brandColor", e.target.value)}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-[8px] border border-line bg-surface p-1 disabled:cursor-not-allowed max-md:h-11"
                />
                <Input
                  id="brand-color"
                  value={values.brandColor}
                  placeholder={defaultColor}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(e) => set("brandColor", e.target.value.trim())}
                  {...describedBy("brand-color", { description: true, error: err("brandColor") })}
                  className="w-32 font-mono max-md:h-11"
                />
              </div>
            </Field>
          </div>

          <div className="space-y-1.5">
            <p id={descriptionLabelId} className="text-sm font-medium text-ink">
              Description
            </p>
            <p id="brand-description-help" className="text-[13px] text-muted">
              Briefly describe your rules, creative direction, and anything else creators should know about your brand.
            </p>
            <RichTextEditor
              id="brand-description"
              labelId={descriptionLabelId}
              describedById={err("descriptionHtml") ? "brand-description-help brand-description-error" : "brand-description-help"}
              initialHtml={saved.descriptionHtml}
              placeholder="Add brand rules, creative brief, and other relevant information creators should know..."
              maxChars={maxDescription}
              disabled={!canEdit || pending}
              invalid={Boolean(err("descriptionHtml"))}
              onChange={(html, characters) => {
                set("descriptionHtml", html);
                setDescriptionChars(characters);
              }}
            />
            {err("descriptionHtml") ? (
              <p id="brand-description-error" className="text-[13px] text-danger">
                {err("descriptionHtml")}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium text-ink">Add links</h2>
              <p className="text-[13px] text-muted">Link your website and app stores so creators can easily find and create content for your brand.</p>
            </div>
            <div role="tablist" aria-label="Links" className="inline-flex rounded-[10px] bg-selected p-0.5">
              {linkTabs.map((t, index) => {
                const active = activeLink === t.key;
                return (
                  <button
                    key={t.key}
                    ref={(el) => {
                      tabRefs.current[t.key] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`link-tab-${t.key}`}
                    aria-selected={active}
                    aria-controls={`link-panel-${t.key}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setActiveLink(t.key)}
                    onKeyDown={(e) => onTabKey(e, index)}
                    className={cn(
                      "rounded-[8px] px-3 py-1 text-[13px] transition-colors max-md:min-h-11",
                      active ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
                      fieldErrors[t.key] && "text-danger",
                    )}
                  >
                    {t.tab}
                  </button>
                );
              })}
            </div>
            {linkTabs.map((t) => (
              <div key={t.key} role="tabpanel" id={`link-panel-${t.key}`} aria-labelledby={`link-tab-${t.key}`} hidden={activeLink !== t.key}>
                <Field id={`brand-${t.key}`} label={t.label} error={err(t.key)}>
                  <Input
                    id={`brand-${t.key}`}
                    type="url"
                    inputMode="url"
                    value={values[t.key]}
                    placeholder={t.placeholder}
                    maxLength={500}
                    onChange={(e) => set(t.key, e.target.value)}
                    {...describedBy(`brand-${t.key}`, { error: err(t.key) })}
                    className="max-md:h-11"
                  />
                </Field>
              </div>
            ))}
          </div>
        </fieldset>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Preview">
          <p className="mb-2 text-[13px] font-medium text-muted">Creator-facing preview</p>
          <BrandPreview values={{ ...values, categories: values.categories }} fallbackColor={defaultColor} />
        </aside>
      </div>

      <section aria-labelledby="danger-zone-heading" className="mt-10 rounded-[12px] border border-danger-line px-5 py-4 lg:max-w-[calc(100%-352px)]">
        <h2 id="danger-zone-heading" className="text-[15px] font-semibold text-danger">
          Danger zone
        </h2>
        <p className="mb-3 mt-0.5 text-sm text-muted">Leave this workspace.</p>
        {dangerZone}
      </section>
    </form>
  );
}

/** Logo / cover slot. Uploads need object storage, which this deployment doesn't have, so "Add" stays disabled. */
function ImageSlot({ title, guidance, shape }: { title: string; guidance: string; shape: "circle" | "square" }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-3">
      <span aria-hidden="true" className={cn("flex size-12 shrink-0 items-center justify-center bg-selected text-subtle", shape === "circle" ? "rounded-full" : "rounded-[8px]")}>
        <ImageOff className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">{guidance}</p>
      </div>
      <Button variant="secondary" size="sm" disabled aria-label={`Add ${title.toLowerCase()} (uploads unavailable)`}>
        Add
      </Button>
    </div>
  );
}
