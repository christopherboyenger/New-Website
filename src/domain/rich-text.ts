/**
 * Brand description rich text (Branding L12). The editor produces HTML in the
 * browser; the server never trusts it and stores only the output of
 * `sanitizeRichText`, which keeps an allowlist of formatting:
 *
 *   h2 (Heading), h3 (Subheading), p, br, strong, em, u, ul, ol, li,
 *   a[href] with https: or mailto: only, always rel="noopener noreferrer" target="_blank".
 *
 * Everything else is removed: script/style/textarea/noscript elements with
 * their contents, event-handler and style attributes, javascript:/data:/http:
 * links (the text stays, the link goes) and unknown tags (their text stays).
 * Browser editor output is normalized (b→strong, i→em, div→p, h1→h2).
 *
 * The 1,000-character limit counts text characters only (what a reader
 * sees), not markup, so formatting never eats into the allowance.
 */
import sanitizeHtml from "sanitize-html";

export const RICH_TEXT_MAX_CHARS = 1000;
/** Upper bound on submitted markup, to reject abusive payloads before parsing. */
export const RICH_TEXT_MAX_HTML = 20_000;

const allowedTags = ["h2", "h3", "p", "br", "strong", "em", "u", "ul", "ol", "li", "a"];

function safeHref(href: string | undefined): string | null {
  const value = (href ?? "").trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value;
  if (!/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

const options: sanitizeHtml.IOptions = {
  allowedTags,
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "template", "iframe", "object", "svg", "math"],
  transformTags: {
    b: "strong",
    i: "em",
    div: "p",
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    a: (_tagName, attribs): sanitizeHtml.Tag => {
      const href = safeHref(attribs.href);
      // An unsafe link loses its attributes here and is unwrapped after sanitizing (see sanitizeRichText).
      // (Renaming it to a disallowed tag would unbalance sibling links' closing tags in sanitize-html.)
      if (!href) return { tagName: "a", attribs: {} };
      return { tagName: "a", attribs: { href, rel: "noopener noreferrer", target: "_blank" } };
    },
  },
};

/** Decodes the four entities sanitize-html emits when escaping text. */
function decodeEscapes(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/** Visible text of (already sanitized or raw) HTML, with entities decoded. */
export function richTextPlainText(html: string): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {}, nonTextTags: options.nonTextTags });
  return decodeEscapes(text);
}

/** Number of text characters counted against the limit (code points, so emoji count once). */
export function richTextLength(html: string): number {
  return Array.from(richTextPlainText(html)).length;
}

/** Allowlist sanitization. Returns "" when nothing visible remains. */
export function sanitizeRichText(html: string): string {
  // Sanitized output is canonical, so an attribute-less <a> is exactly "<a>": unwrap it, keeping its text.
  const clean = sanitizeHtml(html, options)
    .replace(/<a>([\s\S]*?)<\/a>/g, "$1")
    .trim();
  return richTextPlainText(clean).trim() ? clean : "";
}

export type RichTextResult = { ok: true; html: string; length: number } | { ok: false; error: string };

/** Sanitizes and enforces the character limit; the stored value is `html`. */
export function validateRichText(input: string, maxChars = RICH_TEXT_MAX_CHARS): RichTextResult {
  if (input.length > RICH_TEXT_MAX_HTML) return { ok: false, error: `Keep the description under ${maxChars.toLocaleString("en-US")} characters.` };
  const html = sanitizeRichText(input);
  const length = richTextLength(html);
  if (length > maxChars) {
    return { ok: false, error: `Keep the description under ${maxChars.toLocaleString("en-US")} characters (currently ${length.toLocaleString("en-US")}).` };
  }
  return { ok: true, html, length };
}
