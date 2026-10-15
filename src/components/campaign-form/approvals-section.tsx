"use client";

import { PlanBadge } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { LockMarker, PlanGateNote } from "./plan-gate";
import { SectionFrame, type SectionProps } from "./section-frame";

export function ApprovalsSection({ active, state, update, errors, entitlements, gate }: SectionProps) {
  const approvalLocked = !entitlements.creator_approval;
  const accountLocked = !entitlements.dedicated_accounts;
  const anyLocked = approvalLocked || accountLocked;

  return (
    <SectionFrame
      id="approvals"
      active={active}
      title="Approvals"
      titleExtra={anyLocked ? <PlanBadge planName={gate.planName} /> : null}
      description="Control who can join and post for this campaign"
    >
      {anyLocked ? <PlanGateNote gate={gate}>Requiring approvals or dedicated accounts needs the {gate.planName} plan.</PlanGateNote> : null}
      <div className="divide-y divide-line">
        <SkipRequire
          id="creator-approval"
          label="Creator approval"
          description="You review and approve creators into your campaign before they can start posting"
          required={state.requireCreatorApproval}
          onChange={(required) => update({ requireCreatorApproval: required })}
          locked={approvalLocked}
          planName={gate.planName}
          error={errors["approvals.requireCreatorApproval"]}
        />
        <SkipRequire
          id="dedicated-account"
          label="Account Creation needed"
          description="Creators must make a dedicated account to post about your brand"
          required={state.requireDedicatedAccount}
          onChange={(required) => update({ requireDedicatedAccount: required })}
          locked={accountLocked}
          planName={gate.planName}
          error={errors["approvals.requireDedicatedAccount"]}
        />
      </div>
      <p className="text-[13px] text-muted">Creator approval decides who can join this campaign. It is separate from reviewing the posts creators submit.</p>
    </SectionFrame>
  );
}

function SkipRequire({
  id,
  label,
  description,
  required,
  onChange,
  locked,
  planName,
  error,
}: {
  id: string;
  label: string;
  description: string;
  required: boolean;
  onChange: (required: boolean) => void;
  locked: boolean;
  planName: string;
  error?: string;
}) {
  const choices = [
    { value: false, text: "Skip", key: "skip" },
    { value: true, text: "Require", key: "require" },
  ];
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between" role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}>
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium text-ink">
          {label}
        </p>
        <p id={`${id}-description`} className="mt-0.5 text-[13px] text-muted">
          {description}
        </p>
        {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
      </div>
      <div className="inline-flex shrink-0 self-start rounded-[10px] bg-selected p-0.5">
        {choices.map((choice) => {
          const pressed = required === choice.value;
          const disabled = locked && choice.value;
          return (
            <button
              key={choice.key}
              id={`${id}-${choice.key}`}
              type="button"
              aria-pressed={pressed}
              disabled={disabled}
              onClick={() => onChange(choice.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] transition-colors max-md:min-h-11",
                pressed ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
                "disabled:cursor-not-allowed disabled:text-subtle disabled:hover:text-subtle",
              )}
            >
              {choice.text}
              <span className="sr-only"> {label}</span>
              {disabled ? <LockMarker planName={planName} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
