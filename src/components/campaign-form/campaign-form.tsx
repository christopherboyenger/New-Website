"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { CreatedCampaign } from "@/server/campaign-form";
import { createCampaignAction } from "@/server/campaign-form";
import type { ActionResult } from "@/server/action-result";
import type { Forecast } from "@/server/forecast";
import { ApprovalsSection } from "./approvals-section";
import { BudgetSection } from "./budget-section";
import { ContentSection } from "./content-section";
import { DetailsSection } from "./details-section";
import { EstimatesPanel } from "./estimates-panel";
import {
  buildSubmission,
  clearErrorsForPatch,
  firstInvalidField,
  formSections,
  initialCampaignFormState,
  isFormDirty,
  normalizeFieldErrors,
  parseDollarsToCents,
  sectionSummaries,
  sectionsWithErrors,
  type CampaignFormState,
  type FieldErrors,
  type FormEntitlements,
  type FormSectionId,
} from "./model";
import { NavigationGuardContext, type NavigationGuard } from "./navigation-guard";
import type { GateContext } from "./plan-gate";
import { sectionTitleId } from "./section-frame";
import { SectionNav } from "./section-nav";
import { TargetingSection } from "./targeting-section";
import { EditorTopBar } from "./top-bar";
import { useReachEstimate, type EstimateInput } from "./use-reach-estimate";

export interface CampaignFormProps {
  slug: string;
  orgName: string;
  backHref: string;
  entitlements: FormEntitlements;
  gate: GateContext;
  recommendedHashtags: string[];
  hashtagPlaceholder: string;
  initialForecast: Forecast;
}

const FORM_ID = "new-campaign-form";

function estimateInputFor(state: CampaignFormState): EstimateInput | null {
  const built = buildSubmission(state);
  if (!built.ok) return null;
  return { dailyBudgetCents: built.submission.dailyBudgetCents, format: built.submission.format, targeting: built.submission.targeting };
}

/** Focuses a field by DOM id (or the first enabled control inside it) after a section switch has rendered. */
function focusField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const focusable = el.matches("input, button, select, textarea") && !(el as HTMLInputElement).disabled ? el : el.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled]), select:not([disabled])");
  (focusable ?? el).focus();
  (focusable ?? el).scrollIntoView({ block: "center" });
}

/**
 * New campaign form (L17–L22): section navigation with summaries, the
 * active section, Estimates and Create campaign. Creating is the only write;
 * it never activates, publishes or charges, and failures keep every input.
 */
export function CampaignForm({ slug, orgName, backHref, entitlements, gate, recommendedHashtags, hashtagPlaceholder, initialForecast }: CampaignFormProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [initial] = useState(initialCampaignFormState);
  const [state, setState] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<FormSectionId>("details");
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = isFormDirty(state, initial) && !leaving;
  const summaries = useMemo(() => sectionSummaries(state), [state]);
  const errorSections = useMemo(() => sectionsWithErrors(errors), [errors]);
  const initialEstimate = useMemo(() => ({ key: JSON.stringify(estimateInputFor(initial)), forecast: initialForecast }), [initial, initialForecast]);
  const estimate = useReachEstimate(slug, estimateInputFor(state), initialEstimate);
  const dailyCents = parseDollarsToCents(state.dailyBudget);

  // Warn before reloads, tab closes and external navigation with unsaved input.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!focusRequest) return;
    const frame = window.requestAnimationFrame(() => focusField(focusRequest.id));
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest]);

  const guard = useCallback<NavigationGuard>(
    (event, href) => {
      if (!dirty) return;
      event.preventDefault();
      setLeaveHref(href);
    },
    [dirty],
  );

  const update = useCallback((patch: Partial<CampaignFormState>) => {
    setState((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => clearErrorsForPatch(prev, patch));
  }, []);

  const goToSection = (id: FormSectionId) => {
    setActiveSection(id);
    setFocusRequest({ id: sectionTitleId(id), seq: Date.now() });
  };

  const showErrors = (message: string, fieldErrors: FieldErrors = {}) => {
    const normalized = normalizeFieldErrors(fieldErrors);
    setErrors(normalized);
    setFormError(message);
    const first = firstInvalidField(normalized);
    if (first) {
      setActiveSection(first.section);
      setFocusRequest({ id: first.fieldId, seq: Date.now() });
    } else {
      setFocusRequest({ id: "campaign-form-error", seq: Date.now() });
    }
  };

  const submit = () => {
    if (pending || leaving) return;
    const built = buildSubmission(state);
    if (!built.ok) {
      showErrors("Check the highlighted fields.", built.fieldErrors);
      return;
    }
    setFormError(null);
    startTransition(async () => {
      let result: ActionResult<CreatedCampaign>;
      try {
        result = await createCampaignAction(slug, built.submission);
      } catch {
        result = { ok: false, error: "We couldn't reach the server, so the campaign wasn't created. Your inputs are still here; try again.", code: "internal" };
      }
      if (result.ok) {
        setLeaving(true);
        notify(`“${result.data.name}” was created. It stays Inactive until you activate it.`, "success");
        router.push(result.data.href);
      } else {
        showErrors(result.error, result.fieldErrors);
      }
    });
  };

  // Enter in a text field must not create the campaign; creation is an explicit button press.
  const preventImplicitSubmit = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target instanceof HTMLInputElement && !["checkbox", "radio", "submit", "button"].includes(target.type)) {
      event.preventDefault();
    }
  };

  const sectionIndex = formSections.findIndex((s) => s.id === activeSection);
  const previous = formSections[sectionIndex - 1];
  const next = formSections[sectionIndex + 1];
  const sectionProps = { state, update, errors, entitlements, gate };
  const busy = pending || leaving;
  const validDaily = dailyCents !== null && !Number.isNaN(dailyCents) ? dailyCents : null;

  const createButton = (className?: string) => (
    <Button type="submit" form={FORM_ID} size="lg" loading={busy} className={className}>
      {busy ? "Creating campaign…" : "Create campaign"}
    </Button>
  );

  return (
    <NavigationGuardContext.Provider value={guard}>
      <EditorTopBar backHref={backHref} />
      <main className="mx-auto grid max-w-[1440px] gap-5 px-4 pt-5 pb-28 md:grid-cols-[232px_minmax(0,1fr)] md:px-6 md:pb-10 lg:grid-cols-[256px_minmax(0,1fr)_300px] lg:px-8">
        <div className="md:sticky md:top-[72px] md:row-span-2 md:self-start lg:row-span-1">
          <SectionNav
            active={activeSection}
            onSelect={goToSection}
            summaries={summaries}
            errorSections={errorSections}
            approvalsBadgePlanName={entitlements.creator_approval && entitlements.dedicated_accounts ? null : gate.planName}
          />
        </div>

        <form
          id={FORM_ID}
          noValidate
          aria-label="New campaign"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onKeyDown={preventImplicitSubmit}
          className="min-w-0 rounded-[12px] border border-line bg-surface px-4 py-6 sm:px-6 md:col-start-2 md:row-start-1 lg:px-8"
        >
          {formError ? (
            <div id="campaign-form-error" tabIndex={-1} role="alert" className="mb-6 rounded-[10px] border border-danger-line bg-danger-soft px-3.5 py-3 text-sm focus:outline-none">
              <p className="flex items-start gap-2 font-medium text-danger">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {formError}
              </p>
              {errorSections.size > 1 ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-ink-2">
                  Sections to check:
                  {formSections
                    .filter((s) => errorSections.has(s.id))
                    .map((s) => (
                      <button key={s.id} type="button" onClick={() => goToSection(s.id)} className="font-medium text-ink underline underline-offset-2">
                        {s.label}
                      </button>
                    ))}
                </p>
              ) : null}
            </div>
          ) : null}

          <DetailsSection
            active={activeSection === "details"}
            {...sectionProps}
            slug={slug}
            orgName={orgName}
            hashtagPlaceholder={hashtagPlaceholder}
            recommendedHashtags={recommendedHashtags}
          />
          <ContentSection active={activeSection === "content"} {...sectionProps} />
          <BudgetSection active={activeSection === "budget"} {...sectionProps} />
          <TargetingSection active={activeSection === "targeting"} {...sectionProps} />
          <ApprovalsSection active={activeSection === "approvals"} {...sectionProps} />

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-4">
            {previous ? (
              <Button variant="ghost" onClick={() => goToSection(previous.id)} className="max-md:min-h-11">
                <ArrowLeft className="size-4" aria-hidden="true" />
                {previous.label}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button variant="secondary" onClick={() => goToSection(next.id)} className="max-md:min-h-11">
                Next: {next.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </form>

        <aside aria-label="Estimates" className="md:col-start-2 lg:sticky lg:top-[72px] lg:col-start-3 lg:row-start-1 lg:self-start">
          <EstimatesPanel
            estimate={estimate}
            dailyBudgetCents={validDaily}
            footer={
              <div className="flex flex-col gap-2">
                {createButton("w-full")}
                <CreateNote />
              </div>
            }
          />
        </aside>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        {createButton("w-full")}
        <CreateNote className="mt-1.5 text-center" />
      </div>

      <Dialog
        open={leaveHref !== null}
        onClose={() => setLeaveHref(null)}
        title="Leave without creating?"
        description="This campaign hasn't been created yet. If you leave now, what you've entered is discarded."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveHref(null)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const href = leaveHref;
                setLeaving(true);
                setLeaveHref(null);
                if (href) router.push(href);
              }}
            >
              Discard and leave
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Nothing has been saved, activated or charged.</p>
      </Dialog>
    </NavigationGuardContext.Provider>
  );
}

function CreateNote({ className }: { className?: string }) {
  return <p className={cn("text-xs text-muted", className)}>Creating doesn&apos;t activate or charge anything. The campaign stays Inactive until you activate it.</p>;
}
