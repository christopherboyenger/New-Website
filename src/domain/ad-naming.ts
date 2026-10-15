/**
 * Ad naming conventions (Ad settings → Naming conventions, L26).
 *
 * A convention is an ordered list of fields (custom text, launch date,
 * creator) joined by a separator. Every generated name ends with the post ID
 * token — the ID of the post or submission in this product — so each ad traces
 * back to its source. That tail is appended by the generator and is not part
 * of the configurable fields, so it cannot be removed or reordered. An
 * individual ad may override the generated name entirely (the source ID is
 * still stored on the launch row).
 *
 * Pure and framework-free: used by the settings editor preview, the launch
 * draft form and the server command that stores the draft.
 */
import { z } from "zod";
import type { NamingConvention } from "@/server/db/schema/integrations";

export type { NamingConvention };
export type NamingField = NamingConvention["fields"][number];

export const namingSeparators = ["_", "-", "|", "."] as const;
export type NamingSeparator = (typeof namingSeparators)[number];

export const namingSeparatorLabels: Record<NamingSeparator, string> = {
  _: "Underscore ( _ )",
  "-": "Hyphen ( - )",
  "|": "Pipe ( | )",
  ".": "Period ( . )",
};

export const MAX_NAMING_FIELDS = 6;
export const MAX_CUSTOM_TEXT = 40;
/** Conservative cap below both providers' ad-name limits. */
export const MAX_AD_NAME = 250;

export const namingFieldLabels: Record<NamingField["kind"], string> = {
  custom: "Custom text",
  date: "Date",
  creator: "Creator",
};

export const POST_ID_LABEL = "Post ID";

export const defaultNamingConvention: NamingConvention = { fields: [{ kind: "date" }, { kind: "creator" }], separator: "_" };

const fieldSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("custom"),
    value: z
      .string()
      .trim()
      .min(1, "Enter the custom text or remove the field.")
      .max(MAX_CUSTOM_TEXT, `Keep custom text to ${MAX_CUSTOM_TEXT} characters or fewer.`),
  }),
  z.object({ kind: z.literal("date") }),
  z.object({ kind: z.literal("creator") }),
]);

export const namingConventionSchema = z
  .object({
    fields: z.array(fieldSchema).max(MAX_NAMING_FIELDS, `Use at most ${MAX_NAMING_FIELDS} fields.`),
    separator: z.enum(namingSeparators, { message: "Choose a separator." }),
  })
  .superRefine((value, ctx) => {
    for (const kind of ["date", "creator"] as const) {
      if (value.fields.filter((f) => f.kind === kind).length > 1) {
        ctx.addIssue({ code: "custom", path: ["fields"], message: `${namingFieldLabels[kind]} can only appear once.` });
      }
    }
  });

/** YYYYMMDD of the UTC calendar day (report days and launch dates are UTC). */
export function formatNamingDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

/**
 * Makes free text safe as one name segment: whitespace becomes "-", anything
 * outside letters, digits, "-", "_", "." and "@" is dropped, and the active
 * separator is removed so segments stay unambiguous.
 */
export function sanitizeNamePart(value: string, separator: string): string {
  let out = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_.@]/gu, "");
  if (separator) out = out.split(separator).join("");
  return out.replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, MAX_CUSTOM_TEXT);
}

export interface AdNameInput {
  convention: NamingConvention;
  /** Creator handle (without "@") or display name. */
  creator: string;
  /** Launch-draft date; formatted as its UTC day. */
  date: Date;
  /** ID of the post or submission in this product. Always the last segment. */
  postId: string;
}

/** Applies the convention. The post ID tail is always present and always last. */
export function generateAdName(input: AdNameInput): string {
  const sep = input.convention.separator;
  // The tail is this product's own ID; it is last, so it may contain the separator.
  const tail = input.postId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "unknown";
  const parts: string[] = [];
  for (const field of input.convention.fields) {
    const part =
      field.kind === "custom"
        ? sanitizeNamePart(field.value, sep)
        : field.kind === "date"
          ? formatNamingDate(input.date)
          : sanitizeNamePart(input.creator.replace(/^@/, ""), sep);
    if (part) parts.push(part);
  }
  let head = parts.join(sep);
  const room = MAX_AD_NAME - tail.length - sep.length;
  if (head.length > room) head = head.slice(0, Math.max(0, room));
  return head ? `${head}${sep}${tail}` : tail;
}

export type OverrideResult = { ok: true; name: string; overridden: boolean } | { ok: false; error: string };

/** An individual ad may replace the generated name; blank means "use the convention". */
export function resolveAdName(generated: string, override: string | null | undefined): OverrideResult {
  const trimmed = (override ?? "").trim();
  if (!trimmed) return { ok: true, name: generated, overridden: false };
  if (trimmed.length > MAX_AD_NAME) return { ok: false, error: `Keep the ad name to ${MAX_AD_NAME} characters or fewer.` };
  if (/\p{Cc}/u.test(trimmed)) return { ok: false, error: "The ad name can't contain line breaks or control characters." };
  return { ok: true, name: trimmed, overridden: trimmed !== generated };
}

/** "<Custom text>_<Date>_<Creator>_<Post ID>" — the shape shown in settings. */
export function namingTemplate(convention: NamingConvention): string {
  const parts = convention.fields.map((f) => `<${f.kind === "custom" ? f.value.trim() || namingFieldLabels.custom : namingFieldLabels[f.kind]}>`);
  return [...parts, `<${POST_ID_LABEL}>`].join(convention.separator);
}

/** Clearly-labelled example values for previews (never real records). */
export const namingExampleValues = {
  creator: "example-creator",
  date: new Date(Date.UTC(2026, 0, 31)),
  postId: "pst_example",
} as const;

export function namingExample(convention: NamingConvention): string {
  return generateAdName({ convention, ...namingExampleValues });
}

/** Swaps a field with its neighbour (Move up / Move down). Out-of-range moves are no-ops. */
export function moveField<T>(fields: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= fields.length || target < 0 || target >= fields.length) return [...fields];
  const next = [...fields];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
