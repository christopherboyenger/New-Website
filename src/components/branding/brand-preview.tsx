import { AppWindow, Globe, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";
import { richTextContentClass } from "./rich-text-styles";

export interface BrandPreviewValues {
  name: string;
  brandHashtag: string;
  categories: string[];
  brandColor: string;
  descriptionHtml: string;
  websiteUrl: string;
  appStoreUrl: string;
  playStoreUrl: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** Readable text color (ink or white) on a hex background. */
function contrastText(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = Number.parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1c1917" : "#ffffff";
}

/**
 * Live, creator-facing brand page preview built only from what the form
 * holds. It deliberately shows no rates, earnings, caps or creator-level
 * economics: those come from campaigns, not branding.
 */
export function BrandPreview({ values, fallbackColor }: { values: BrandPreviewValues; fallbackColor: string }) {
  const color = /^#[0-9a-f]{6}$/i.test(values.brandColor) ? values.brandColor : fallbackColor;
  const name = values.name.trim() || "Your brand";
  const links = [
    { key: "web", label: "Website", value: values.websiteUrl, icon: Globe },
    { key: "ios", label: "App Store", value: values.appStoreUrl, icon: AppWindow },
    { key: "android", label: "Google Play", value: values.playStoreUrl, icon: Smartphone },
  ].filter((l) => l.value.trim());
  const categories = values.categories.filter(Boolean);

  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-sm" role="group" aria-label="Brand page preview">
      <div className="h-24 bg-selected" style={{ backgroundColor: color, opacity: 0.9 }} aria-hidden="true" />
      <div className="px-4 pb-5">
        <div
          className="-mt-7 flex size-14 items-center justify-center rounded-full border-4 border-surface text-base font-bold"
          style={{ backgroundColor: color, color: contrastText(color) }}
          aria-hidden="true"
        >
          {initials(name)}
        </div>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted">About {name}</p>
        <p className="text-lg font-semibold leading-snug text-ink">{name}</p>
        {values.brandHashtag ? <p className="text-sm text-ink-2">#{values.brandHashtag.replace(/^#/, "")}</p> : null}
        {categories.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Categories">
            {categories.map((c) => (
              <li key={c} className="rounded-full bg-selected px-2 py-0.5 text-xs text-ink-2">
                {c}
              </li>
            ))}
          </ul>
        ) : null}
        {values.descriptionHtml ? (
          // Same markup the editor holds; the stored copy is sanitized on the server.
          <div className={cn("mt-3 text-[13px] text-ink-2", richTextContentClass)} dangerouslySetInnerHTML={{ __html: values.descriptionHtml }} />
        ) : (
          <p className="mt-3 text-[13px] text-subtle">Your description appears here.</p>
        )}
        {links.length ? (
          <ul className="mt-4 space-y-1.5">
            {links.map(({ key, label, icon: Icon }) => (
              <li key={key} className={cn("flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-[13px] font-medium text-ink")}>
                <Icon className="size-4 text-muted" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
