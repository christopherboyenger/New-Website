"use client";

import { useState } from "react";
import { Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Input } from "@/components/ui/form";
import type { ContentFormat } from "@/domain/playbook-content";
import { checkNewHashtag, playbookLimits } from "@/domain/playbook-validation";
import { OptionList } from "./option-list";

/**
 * Hashtags & Descriptions (L07). Edits a local copy; Close discards it and
 * Save applies it to the draft and saves the draft. The campaign's primary
 * hashtag is always appended and can't be added or removed here.
 */
export function HashtagsDialog({
  open,
  onClose,
  format,
  primaryHashtag,
  descriptions,
  hashtags,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  format: ContentFormat;
  primaryHashtag: string;
  descriptions: string[];
  hashtags: string[];
  saving: boolean;
  onSave: (next: { descriptions: string[]; hashtags: string[] }) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Hashtags & Descriptions" size="md">
      {open ? (
        <HashtagsForm
          format={format}
          primaryHashtag={primaryHashtag}
          initialDescriptions={descriptions}
          initialHashtags={hashtags}
          saving={saving}
          onCancel={onClose}
          onSave={onSave}
        />
      ) : null}
    </Dialog>
  );
}

function HashtagsForm({
  format,
  primaryHashtag,
  initialDescriptions,
  initialHashtags,
  saving,
  onCancel,
  onSave,
}: {
  format: ContentFormat;
  primaryHashtag: string;
  initialDescriptions: string[];
  initialHashtags: string[];
  saving: boolean;
  onCancel: () => void;
  onSave: (next: { descriptions: string[]; hashtags: string[] }) => void;
}) {
  const [descriptions, setDescriptions] = useState(initialDescriptions.length > 0 ? initialDescriptions : [""]);
  const [hashtags, setHashtags] = useState(initialHashtags);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | undefined>();
  const inputId = "add-hashtag";

  /** Adds the typed hashtag; returns the new list, or null when it is invalid. */
  const addHashtag = (): string[] | null => {
    const result = checkNewHashtag(input, hashtags, primaryHashtag);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    const next = [...hashtags, result.tag];
    setHashtags(next);
    setInput("");
    setError(undefined);
    return next;
  };

  const save = () => {
    // A hashtag still in the input is added rather than silently dropped.
    const nextHashtags = input.trim() ? addHashtag() : hashtags;
    if (nextHashtags) onSave({ descriptions, hashtags: nextHashtags });
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        {format === "ugc"
          ? "Each creator's post gets one of your descriptions plus your hashtags, mixed and matched like the text on screen."
          : "Each post gets one of your descriptions, 2–3 of your hashtags picked at random, and the campaign hashtag."}
      </p>

      <OptionList
        heading="Description options"
        hint="one is picked per creator"
        itemLabel="Description option"
        addLabel="Add a description option"
        placeholder="Write a post description option…"
        maxLength={playbookLimits.description}
        multiline
        values={descriptions}
        onChange={setDescriptions}
        emptyText="No descriptions yet. Add at least one before publishing."
      />

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-ink">
          Hashtags <span className="font-normal text-muted">{format === "ugc" ? "added to the end of every post" : "2–3 are picked for each post"}</span>
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Hashtags">
          {hashtags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-selected py-0.5 pl-2.5 pr-0.5 text-[13px] text-ink">
              #{tag}
              <button
                type="button"
                onClick={() => setHashtags(hashtags.filter((t) => t !== tag))}
                aria-label={`Remove hashtag ${tag}`}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink max-md:size-9"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
          <li
            className="inline-flex items-center gap-1 rounded-full border border-line py-0.5 pl-2.5 pr-2.5 text-[13px] text-ink-2"
            title="Campaign hashtag, always added"
          >
            #{primaryHashtag}
            <Lock className="size-3 text-muted" aria-hidden="true" />
            <span className="sr-only">(campaign hashtag, always added)</span>
          </li>
        </ul>
        <p id={`${inputId}-description`} className="text-[12px] text-muted">
          #{primaryHashtag} is the campaign hashtag. It&apos;s added to every post so the post matches this campaign.
        </p>
        <label htmlFor={inputId} className="sr-only">
          Add hashtag
        </label>
        <Input
          id={inputId}
          value={input}
          placeholder="Add hashtag ↵"
          maxLength={60}
          autoComplete="off"
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addHashtag();
            }
          }}
          {...describedBy(inputId, { description: true, error })}
          className="max-md:h-11"
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onCancel} className="max-md:min-h-11">
          Close
        </Button>
        <Button loading={saving} onClick={save} className="max-md:min-h-11">
          Save
        </Button>
      </div>
    </div>
  );
}
