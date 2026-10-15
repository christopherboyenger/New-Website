"use client";

import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { normalizeHashtag } from "@/domain/campaign";
import { cn } from "@/lib/cn";
import { campaignNamePlaceholder } from "./model";
import { SectionFrame, type SectionProps } from "./section-frame";
import { useHashtagAvailability, type HashtagAvailability } from "./use-hashtag-availability";

export function DetailsSection({
  active,
  state,
  update,
  errors,
  slug,
  orgName,
  hashtagPlaceholder,
  recommendedHashtags,
}: Pick<SectionProps, "active" | "state" | "update" | "errors"> & {
  slug: string;
  orgName: string;
  hashtagPlaceholder: string;
  recommendedHashtags: string[];
}) {
  const availability = useHashtagAvailability(slug, state.hashtag);
  const nameError = errors.name;
  const tagError = errors.primaryHashtag;
  const currentTag = normalizeHashtag(state.hashtag);

  return (
    <SectionFrame id="details" active={active} title="Campaign Details" description="Name the campaign and choose the hashtag that ties creators' posts to it.">
      <Field id="campaign-name" label="Campaign Name" description="Enter your campaign name" error={nameError}>
        <Input
          id="campaign-name"
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder={campaignNamePlaceholder(orgName, state.format)}
          maxLength={100}
          autoComplete="off"
          aria-describedby={ids("campaign-name-description", nameError && "campaign-name-error")}
          aria-invalid={nameError ? true : undefined}
          className="max-md:h-11"
        />
      </Field>

      <div className="flex flex-col gap-3">
        <Field id="campaign-hashtag" label="Primary Hashtag" description="Creators include this in every post" error={tagError}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted" aria-hidden="true">
              #
            </span>
            <Input
              id="campaign-hashtag"
              value={state.hashtag}
              onChange={(e) => update({ hashtag: e.target.value.replace(/^#+/, "") })}
              placeholder={hashtagPlaceholder}
              maxLength={60}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby={ids("campaign-hashtag-description", tagError && "campaign-hashtag-error", !tagError && "campaign-hashtag-status")}
              aria-invalid={tagError || availability.status === "taken" || availability.status === "invalid" ? true : undefined}
              className="pl-7 max-md:h-11"
            />
          </div>
          <HashtagStatus availability={tagError ? { status: "idle" } : availability} />
        </Field>

        {recommendedHashtags.length ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="recommended-hashtags-label">
            <span id="recommended-hashtags-label" className="text-[13px] text-muted">
              Recommended:
            </span>
            {recommendedHashtags.map((tag) => {
              const chosen = currentTag === normalizeHashtag(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => update({ hashtag: tag })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[13px] transition-colors max-md:min-h-11",
                    chosen ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-hover",
                  )}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        ) : null}
        <p className="text-[13px] text-muted">Hashtags are unique across all campaigns and saved in lowercase, so each post matches exactly one campaign.</p>
      </div>
    </SectionFrame>
  );
}

function ids(...values: Array<string | false | undefined>): string | undefined {
  const joined = values.filter(Boolean).join(" ");
  return joined || undefined;
}

/** Live availability message; the region stays mounted so changes are announced. */
function HashtagStatus({ availability }: { availability: HashtagAvailability }) {
  return (
    <p id="campaign-hashtag-status" aria-live="polite" className="min-h-5 text-[13px]">
      {availability.status === "checking" ? (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Spinner className="size-3.5" />
          Checking availability…
        </span>
      ) : availability.status === "available" ? (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />#{availability.tag} is available.
        </span>
      ) : availability.status === "taken" ? (
        <span className="inline-flex items-center gap-1.5 text-danger">
          <XCircle className="size-3.5" aria-hidden="true" />#{availability.tag} is already used by another campaign. Choose a different one.
        </span>
      ) : availability.status === "invalid" ? (
        <span className="inline-flex items-center gap-1.5 text-danger">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {availability.message}
        </span>
      ) : availability.status === "error" ? (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {availability.message}
        </span>
      ) : null}
    </p>
  );
}
