import { getCurrentSession } from "@/server/auth/session";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader, type HeaderViewer } from "@/components/marketing/site-header";

/** Public marketing surface: black canvas, white type, accent CTAs. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  const viewer: HeaderViewer | null = current
    ? {
        name: [current.user.firstName, current.user.lastName].filter(Boolean).join(" ") || current.user.email,
        email: current.user.email,
        initials: (current.user.firstName || current.user.email).slice(0, 1).toUpperCase(),
      }
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <a
        href="#main"
        className="sr-only z-50 rounded-[8px] bg-white px-3 py-2 text-sm font-medium text-black focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader viewer={viewer} overlay />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
