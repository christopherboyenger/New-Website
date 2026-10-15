/**
 * Prefixed, URL-safe random identifiers (e.g. `cmp_7k2m...`). Prefixes make
 * IDs self-describing in logs and URLs; randomness makes them unguessable,
 * but authorization never relies on that (every lookup is tenant-qualified).
 */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export type IdPrefix =
  | "usr"
  | "ses"
  | "tok"
  | "org"
  | "inv"
  | "cmp"
  | "pbk"
  | "rev"
  | "scn"
  | "sld"
  | "med"
  | "crt"
  | "acc"
  | "pst"
  | "obs"
  | "led"
  | "whk"
  | "pop"
  | "int"
  | "crd"
  | "oau"
  | "api"
  | "adl"
  | "sub"
  | "cnv"
  | "msg"
  | "aud"
  | "eml"
  | "lead"
  | "obd";

export function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomString(20)}`;
}

/** Lowercase URL slug from free text; callers must still check uniqueness. */
export function slugify(input: string, maxLength = 40): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "workspace";
}
