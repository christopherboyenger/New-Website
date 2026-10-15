import type { ReactNode } from "react";
import type { CampaignFormState, FieldErrors, FormEntitlements, FormSectionId } from "./model";
import type { GateContext } from "./plan-gate";

/** Props every form section receives from the form. */
export interface SectionProps {
  active: boolean;
  state: CampaignFormState;
  update: (patch: Partial<CampaignFormState>) => void;
  errors: FieldErrors;
  entitlements: FormEntitlements;
  gate: GateContext;
}

export function sectionDomId(id: FormSectionId): string {
  return `section-${id}`;
}

export function sectionTitleId(id: FormSectionId): string {
  return `section-${id}-title`;
}

/**
 * One section of the form. Inactive sections stay mounted but hidden, so
 * their values and popovers keep state while the user moves around.
 */
export function SectionFrame({
  id,
  active,
  title,
  titleExtra,
  description,
  children,
}: {
  id: FormSectionId;
  active: boolean;
  title: string;
  titleExtra?: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={sectionDomId(id)} aria-labelledby={sectionTitleId(id)} hidden={!active}>
      <header className="mb-6">
        <h2 id={sectionTitleId(id)} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-xl leading-7 font-semibold text-ink focus:outline-none">
          {title}
          {titleExtra}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </header>
      <div className="flex flex-col gap-7">{children}</div>
    </section>
  );
}

/** Sub-heading inside a section ("Budget", "Rates & Bonuses"). */
export function SubHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
      {children}
    </h3>
  );
}
