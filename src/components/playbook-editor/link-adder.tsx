"use client";

import { useId, useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input } from "@/components/ui/form";
import { playbookLimits, validateReferenceUrl } from "@/domain/playbook-validation";

/**
 * Adds an external https link (with an optional title). Used for UGC
 * reference examples and slideshow image options while media storage is not
 * provisioned. Validation runs on add; nothing is fetched from the link.
 */
export function LinkAdder({
  urlLabel,
  titleLabel = "Title",
  addLabel,
  addAccessibleLabel,
  onAdd,
  disabled,
  disabledReason,
}: {
  urlLabel: string;
  titleLabel?: string;
  addLabel: string;
  /** Distinguishes repeated add buttons; must start with the visible label. */
  addAccessibleLabel?: string;
  onAdd: (link: { url: string; title: string }) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    const result = validateReferenceUrl(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAdd({ url: result.url, title: title.trim() });
    setUrl("");
    setTitle("");
    setError(undefined);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field id={`${id}-url`} label={urlLabel} error={error}>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={url}
            maxLength={playbookLimits.url}
            disabled={disabled}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            {...describedBy(`${id}-url`, { error })}
            className="max-md:h-11"
          />
        </Field>
        <Field id={`${id}-title`} label={titleLabel} optional>
          <Input
            id={`${id}-title`}
            value={title}
            maxLength={playbookLimits.referenceTitle}
            disabled={disabled}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="max-md:h-11"
          />
        </Field>
        <Button
          variant="secondary"
          onClick={submit}
          disabled={disabled}
          aria-label={addAccessibleLabel}
          className={error ? "sm:mb-[26px] max-md:min-h-11" : "max-md:min-h-11"}
        >
          <Link2 className="size-4" aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
      {disabled && disabledReason ? <p className="text-[13px] text-muted">{disabledReason}</p> : null}
    </div>
  );
}
