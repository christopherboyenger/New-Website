/**
 * Product identity. The reference product's name, wordmark, marketing claims
 * and endpoints are NOT used: this is a separate product (see
 * docs/decisions.md DEC-001). Replace the placeholder name before launch.
 */
export const site = {
  /** Working title — placeholder until the product name is chosen. */
  name: process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "Acme Creators",
  /** Short lowercase wordmark used in headers. */
  wordmark: process.env.NEXT_PUBLIC_PRODUCT_WORDMARK ?? "acme",
  tagline: "Creator-led marketing, measured end to end.",
  /** Public origin of this deployment; used for absolute links, OAuth callbacks and the MCP URL. */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? null,
  /** Sales booking destination. When null, sales CTAs only save the lead and say so. */
  salesBookingUrl: process.env.NEXT_PUBLIC_SALES_BOOKING_URL ?? null,
  docsUrl: process.env.NEXT_PUBLIC_DOCS_URL ?? null,
} as const;

/** This product's own reporting API base and MCP endpoint (never the reference product's). */
export function reportingApiBaseUrl(): string {
  return `${site.appUrl}/api/v1`;
}

export function mcpServerUrl(): string {
  return `${site.appUrl}/api/mcp`;
}
