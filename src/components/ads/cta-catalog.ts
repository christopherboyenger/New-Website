/**
 * Call-to-action catalogs for the Default CTA tab and launch drafts.
 *
 * Values are the providers' public CTA enum names (Meta Marketing API
 * `call_to_action.type`; TikTok API for Business `call_to_action`). This is a
 * subset chosen for creator-content ads, not the full enum. Before a launch
 * adapter is enabled, re-verify every value against the API versions the
 * adapter pins (docs/decisions/ads.md ADS-06). Pure data, safe on client and
 * server.
 */
import type { AdPlatform } from "@/domain/tracking-params";

export interface CtaOption {
  value: string;
  label: string;
}

export const ctaCatalog: Record<AdPlatform, readonly CtaOption[]> = {
  meta: [
    { value: "LEARN_MORE", label: "Learn more" },
    { value: "SHOP_NOW", label: "Shop now" },
    { value: "SIGN_UP", label: "Sign up" },
    { value: "DOWNLOAD", label: "Download" },
    { value: "INSTALL_MOBILE_APP", label: "Install now" },
    { value: "USE_APP", label: "Use app" },
    { value: "BUY_NOW", label: "Buy now" },
    { value: "ORDER_NOW", label: "Order now" },
    { value: "GET_OFFER", label: "Get offer" },
    { value: "SUBSCRIBE", label: "Subscribe" },
    { value: "BOOK_TRAVEL", label: "Book now" },
    { value: "CONTACT_US", label: "Contact us" },
    { value: "APPLY_NOW", label: "Apply now" },
    { value: "WATCH_MORE", label: "Watch more" },
    { value: "PLAY_GAME", label: "Play game" },
  ],
  tiktok: [
    { value: "LEARN_MORE", label: "Learn more" },
    { value: "SHOP_NOW", label: "Shop now" },
    { value: "SIGN_UP", label: "Sign up" },
    { value: "DOWNLOAD_NOW", label: "Download" },
    { value: "INSTALL_NOW", label: "Install now" },
    { value: "ORDER_NOW", label: "Order now" },
    { value: "SUBSCRIBE", label: "Subscribe" },
    { value: "BOOK_NOW", label: "Book now" },
    { value: "CONTACT_US", label: "Contact us" },
    { value: "APPLY_NOW", label: "Apply now" },
    { value: "WATCH_NOW", label: "Watch now" },
    { value: "PLAY_GAME", label: "Play game" },
    { value: "VISIT_STORE", label: "Visit store" },
    { value: "GET_QUOTE", label: "Get quote" },
    { value: "READ_MORE", label: "Read more" },
  ],
};

export function isValidCta(platform: AdPlatform, value: string): boolean {
  return ctaCatalog[platform].some((o) => o.value === value);
}

export function ctaLabel(platform: AdPlatform, value: string | null): string | null {
  if (!value) return null;
  return ctaCatalog[platform].find((o) => o.value === value)?.label ?? value;
}
