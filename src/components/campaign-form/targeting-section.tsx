"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { genderOptions, minCreatorLevelLabels, platformLabels, platforms, type GenderTarget, type Platform } from "@/domain/campaign";
import { countryName, countryOptions, metroTargetingApplies, usMetroLabel, usMetroOptions, type CatalogOption } from "@/domain/targeting-catalog";
import { cn } from "@/lib/cn";
import { ChipList, FilterPopover, FilterRow, OptionPicker } from "./filter-controls";
import { ageRangeSummary, creatorLevelChoices, genderLabels, type CampaignFormState } from "./model";
import { LockMarker, PlanGateNote } from "./plan-gate";
import { SectionFrame, SubHeading, type SectionProps } from "./section-frame";

const platformOptions: CatalogOption[] = platforms.map((p) => ({ id: p, label: platformLabels[p], keywords: p }));
const genderPickerOptions: CatalogOption[] = genderOptions.map((g) => ({ id: g, label: genderLabels[g], keywords: "" }));

export function TargetingSection({ active, state, update, errors, entitlements, gate }: SectionProps) {
  const countries = useMemo(() => countryOptions(), []);
  const metros = useMemo(() => usMetroOptions(), []);
  const demographicsLocked = !entitlements.demographic_targeting;
  const levelLocked = !entitlements.creator_level_targeting;
  const metrosApply = metroTargetingApplies(state.countries);
  const ageError = errors["targeting.ageMin"] ?? errors["targeting.ageMax"];
  const hasAge = Boolean(state.ageMin.trim() || state.ageMax.trim());

  return (
    <SectionFrame id="targeting" active={active} title="Targeting" description="Choose where this campaign runs and who can join">
      <div className="divide-y divide-line">
        <FilterRow
          id="countries"
          label="Countries"
          description="We'll only show your campaign to creators in these countries"
          error={errors["targeting.countries"]}
          value={
            <ChipList
              items={state.countries.map((code) => ({ id: code, label: countryName(code) }))}
              emptyLabel="All countries"
              noun="countries"
              onRemove={(id) => update({ countries: state.countries.filter((c) => c !== id) })}
            />
          }
          control={
            <FilterPopover
              triggerId="countries-filter-trigger"
              triggerLabel="Add filter"
              triggerAriaLabel="Add countries filter"
              dialogLabel="Countries"
              invalid={Boolean(errors["targeting.countries"])}
              describedBy={errors["targeting.countries"] ? "countries-error" : undefined}
            >
              {(close) => (
                <OptionPicker label="countries" options={countries} selected={state.countries} multiple onChange={(next) => update({ countries: next })} onDone={close} />
              )}
            </FilterPopover>
          }
        />
        <FilterRow
          id="platforms"
          label="Platforms"
          description="Creators will make posts on these platforms for your campaign"
          error={errors["targeting.platforms"]}
          value={
            <ChipList
              items={state.platforms.map((p) => ({ id: p, label: platformLabels[p] }))}
              emptyLabel="All platforms"
              noun="platforms"
              onRemove={(id) => update({ platforms: state.platforms.filter((p) => p !== id) })}
            />
          }
          control={
            <FilterPopover
              triggerId="platforms-filter-trigger"
              triggerLabel="Add filter"
              triggerAriaLabel="Add platforms filter"
              dialogLabel="Platforms"
              invalid={Boolean(errors["targeting.platforms"])}
            >
              {(close) => (
                <OptionPicker
                  label="platforms"
                  options={platformOptions}
                  selected={state.platforms}
                  multiple
                  searchable={false}
                  onChange={(next) => update({ platforms: next as Platform[] })}
                  onDone={close}
                />
              )}
            </FilterPopover>
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <SubHeading>
            Demographics
            {demographicsLocked ? <PlanBadge planName={gate.planName} /> : null}
          </SubHeading>
          <p className="mt-0.5 text-[13px] text-muted">Configure your creator demographic targeting</p>
        </div>
        {demographicsLocked ? <PlanGateNote gate={gate}>Age, gender and location targeting require the {gate.planName} plan.</PlanGateNote> : null}
        <div className="divide-y divide-line rounded-[10px] border border-line px-4 py-4">
          <FilterRow
            id="age"
            label="Age range"
            description="Creators in these age ranges will post for your campaigns"
            error={ageError}
            value={<span className="text-sm text-ink-2">{ageRangeSummary(state.ageMin, state.ageMax)}</span>}
            control={
              <FilterPopover
                triggerId="age-filter-trigger"
                triggerLabel={hasAge ? "Change" : "Add filter"}
                triggerAriaLabel={hasAge ? "Change age range filter" : "Add age range filter"}
                dialogLabel="Age range"
                disabled={demographicsLocked}
                invalid={Boolean(ageError)}
              >
                {(close) => <AgeRangeEditor state={state} update={update} onDone={close} />}
              </FilterPopover>
            }
          />
          <FilterRow
            id="gender"
            label="Gender"
            description="Only creators of this gender can post for you"
            error={errors["targeting.gender"]}
            value={<span className="text-sm text-ink-2">{genderLabels[state.gender]}</span>}
            control={
              <FilterPopover
                triggerId="gender-filter-trigger"
                triggerLabel={state.gender === "any" ? "Add filter" : "Change"}
                triggerAriaLabel={state.gender === "any" ? "Add gender filter" : "Change gender filter"}
                dialogLabel="Gender"
                disabled={demographicsLocked}
                invalid={Boolean(errors["targeting.gender"])}
              >
                {(close) => (
                  <OptionPicker
                    label="genders"
                    options={genderPickerOptions}
                    selected={[state.gender]}
                    multiple={false}
                    searchable={false}
                    onChange={([gender]) => update({ gender: gender as GenderTarget })}
                    onDone={close}
                  />
                )}
              </FilterPopover>
            }
          />
          <FilterRow
            id="locations"
            label="Locations"
            description="We'll only show your campaign to US creators in these metro areas"
            error={errors["targeting.metros"]}
            value={
              <ChipList
                items={state.metros.map((id) => ({ id, label: usMetroLabel(id) }))}
                emptyLabel="All of the US"
                noun="metro areas"
                onRemove={(id) => update({ metros: state.metros.filter((m) => m !== id) })}
              />
            }
            control={
              <FilterPopover
                triggerId="locations-filter-trigger"
                triggerLabel="Add filter"
                triggerAriaLabel="Add locations filter"
                dialogLabel="US metro areas"
                disabled={demographicsLocked || !metrosApply}
                invalid={Boolean(errors["targeting.metros"])}
                describedBy={!demographicsLocked && !metrosApply ? "locations-prerequisite" : undefined}
              >
                {(close) => (
                  <OptionPicker label="metro areas" options={metros} selected={state.metros} multiple onChange={(next) => update({ metros: next })} onDone={close} />
                )}
              </FilterPopover>
            }
            note={
              !demographicsLocked && !metrosApply ? (
                <div id="locations-prerequisite" className={cn("flex flex-wrap items-center gap-2 text-[13px]", state.metros.length ? "text-danger" : "text-muted")}>
                  <span>
                    {state.metros.length
                      ? "These metro areas only apply to US creators, but your country filter doesn't include the United States."
                      : "Add United States to Countries to target US metro areas."}
                  </span>
                  {state.metros.length ? (
                    <Button variant="secondary" size="sm" onClick={() => update({ metros: [] })}>
                      Remove metro filter
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-3" role="group" aria-labelledby="creator-level-label" aria-describedby="creator-level-description">
        <div>
          <SubHeading id="creator-level-label">Creator level</SubHeading>
          <p id="creator-level-description" className="mt-0.5 text-[13px] text-muted">
            Minimum creator tier eligible to join
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {creatorLevelChoices.map((level) => {
            const locked = levelLocked && level !== "all";
            const pressed = state.minCreatorLevel === level;
            return (
              <button
                key={level}
                id={`creator-level-${level}`}
                type="button"
                aria-pressed={pressed}
                disabled={locked}
                onClick={() => update({ minCreatorLevel: level })}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-sm transition-colors max-md:min-h-11",
                  pressed ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-hover",
                  "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted disabled:hover:bg-canvas",
                )}
              >
                {minCreatorLevelLabels[level]}
                {locked ? <LockMarker planName={gate.planName} /> : null}
              </button>
            );
          })}
        </div>
        {errors["targeting.minCreatorLevel"] ? <p className="text-[13px] text-danger">{errors["targeting.minCreatorLevel"]}</p> : null}
        {levelLocked ? <PlanGateNote gate={gate}>Levels above All creators require the {gate.planName} plan.</PlanGateNote> : null}
      </div>
    </SectionFrame>
  );
}

function AgeRangeEditor({ state, update, onDone }: { state: CampaignFormState; update: (patch: Partial<CampaignFormState>) => void; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="age-min" className="text-[13px] font-medium text-ink">
            Minimum age
          </label>
          <Input id="age-min" type="number" inputMode="numeric" min={13} max={100} placeholder="Any" value={state.ageMin} onChange={(e) => update({ ageMin: e.target.value })} aria-describedby="age-help" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="age-max" className="text-[13px] font-medium text-ink">
            Maximum age
          </label>
          <Input id="age-max" type="number" inputMode="numeric" min={13} max={100} placeholder="Any" value={state.ageMax} onChange={(e) => update({ ageMax: e.target.value })} aria-describedby="age-help" />
        </div>
      </div>
      <p id="age-help" className="text-[13px] text-muted">
        Ages 13–100. Leave a side empty for no limit.
      </p>
      <div className="flex justify-end gap-1.5 border-t border-line pt-2">
        {state.ageMin || state.ageMax ? (
          <Button variant="ghost" size="sm" onClick={() => update({ ageMin: "", ageMax: "" })}>
            Clear
          </Button>
        ) : null}
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
