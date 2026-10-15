"use client";

/**
 * Ad settings editor (L11, L26–L28): four tabs held in local state (the route
 * never changes) and one shared Save, disabled until something changes.
 * Saves carry the loaded `version`; a conflict keeps the edits on screen and
 * offers to reload the latest saved settings. Members see everything
 * read-only.
 */
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Lock } from "lucide-react";
import type { AdDefaults } from "@/server/ad-settings";
import { saveAdSettings } from "@/server/ad-settings";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CopyTemplatesPanel, CtaPanel, LinksPanel, NamingPanel, type PanelProps } from "./ad-settings-panels";

const tabs = [
  { key: "copy", label: "Copy templates", errorPrefix: "copyTemplates" },
  { key: "naming", label: "Naming conventions", errorPrefix: "naming" },
  { key: "links", label: "Links & parameters", errorPrefix: "links" },
  { key: "cta", label: "Default CTA", errorPrefix: "defaultCta" },
] as const;
type TabKey = (typeof tabs)[number]["key"];

export function AdSettingsForm({ slug, initial, version: initialVersion, canEdit }: { slug: string; initial: AdDefaults; version: number; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const baseId = useId();
  const [saved, setSaved] = useState(initial);
  const [settings, setSettings] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [tab, setTab] = useState<TabKey>("copy");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const update: PanelProps["update"] = (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    setFormError(null);
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveAdSettings(slug, version, settings);
      if (result.ok) {
        setSaved(settings);
        setVersion(result.data.version);
        setErrors({});
        setFormError(null);
        setConflict(null);
        notify(result.message ?? "Ad settings saved.", "success");
        return;
      }
      if (result.code === "conflict") {
        setConflict(result.error);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error);
      const firstBad = tabs.find((t) => Object.keys(result.fieldErrors ?? {}).some((k) => k.startsWith(t.errorPrefix)));
      if (firstBad) setTab(firstBad.key);
    });
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setTab(tabs[next].key);
    tabRefs.current[next]?.focus();
  };

  const tabErrors = (prefix: string) => Object.keys(errors).some((k) => k.startsWith(prefix));
  const panelProps: PanelProps = { settings, update, errors, idPrefix: baseId };

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-7 text-ink">Ad settings</h1>
          <p className="mt-1 text-sm text-muted">The defaults every new ad launch starts from.</p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-3">
            {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
            <Button onClick={save} disabled={!dirty || Boolean(conflict)} loading={pending} className="max-md:min-h-11">
              Save
            </Button>
          </div>
        ) : (
          <p className="flex max-w-xs items-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            Only workspace owners can change ad settings.
          </p>
        )}
      </header>

      <div className="space-y-3">
        <InlineAlert tone="info">These defaults apply to new ad launches only. Saving never changes ads that already exist.</InlineAlert>
        {conflict ? (
          <InlineAlert
            tone="warning"
            title="Not saved"
            action={
              <Button size="sm" variant="secondary" onClick={() => router.refresh()} className="max-md:min-h-11">
                Reload latest
              </Button>
            }
          >
            {conflict} Reloading replaces your unsaved edits.
          </InlineAlert>
        ) : null}
        <FormError message={formError} />
      </div>

      <div role="tablist" aria-label="Ad settings sections" className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t, i) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors md:min-h-9",
                active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {tabErrors(t.errorPrefix) ? (
                <span className="size-1.5 rounded-full bg-danger" aria-label="has errors" role="img" />
              ) : null}
            </button>
          );
        })}
      </div>

      <fieldset disabled={!canEdit || pending} className="min-w-0">
        <legend className="sr-only">Ad launch defaults</legend>
        {tabs.map((t) => (
          <div
            key={t.key}
            role="tabpanel"
            id={`${baseId}-panel-${t.key}`}
            aria-labelledby={`${baseId}-tab-${t.key}`}
            hidden={tab !== t.key}
            tabIndex={0}
            className="pt-6 focus-visible:outline-none"
          >
            {t.key === "copy" ? <CopyTemplatesPanel {...panelProps} /> : null}
            {t.key === "naming" ? <NamingPanel {...panelProps} /> : null}
            {t.key === "links" ? <LinksPanel {...panelProps} /> : null}
            {t.key === "cta" ? <CtaPanel {...panelProps} /> : null}
          </div>
        ))}
      </fieldset>
    </div>
  );
}
