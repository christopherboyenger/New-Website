import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { site } from "@/config/site";
import { productSections, startHref } from "./content";
import { Wordmark } from "./wordmark";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

/**
 * Multi-column footer with real destinations only. Terms and Privacy pages do
 * not exist yet, so they are not linked (MARKETING-08).
 */
export function SiteFooter() {
  const columns: Array<{ title: string; links: FooterLink[] }> = [
    { title: "Product", links: productSections.map((s) => ({ label: s.label, href: `/#${s.id}` })) },
    {
      title: "Learn",
      links: [
        { label: "How it works", href: "/how-it-works" },
        { label: "Pricing", href: "/pricing" },
        ...(site.docsUrl ? [{ label: "Documentation", href: site.docsUrl, external: true }] : []),
      ],
    },
    {
      title: "Creators",
      links: [
        { label: "For creators", href: "/creators" },
        { label: "Apply as a creator", href: "/creator/sign-up" },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Sign in", href: "/auth/sign-in" },
        { label: "Create an account", href: startHref("footer") },
        ...(site.supportEmail ? [{ label: "Contact", href: `mailto:${site.supportEmail}`, external: true }] : []),
      ],
    },
  ];

  return (
    <footer className="border-t border-white/10 bg-black text-white">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-12 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-2xl font-semibold tracking-tight sm:text-3xl">Start your first creator campaign.</p>
            <p className="mt-2 max-w-xl text-sm text-white/60">Set up a workspace, write a playbook and publish when you are ready.</p>
          </div>
          <Link
            href={startHref("footer")}
            className="inline-flex h-11 w-fit items-center gap-1.5 rounded-[10px] bg-accent px-5 text-[15px] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Get started <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-10 pt-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="flex flex-col gap-3">
            <Wordmark />
            <p className="max-w-xs text-sm text-white/55">{site.tagline}</p>
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-medium tracking-wide text-white/45 uppercase">{column.title}</h2>
              <ul className="mt-3 flex flex-col gap-1">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} className="inline-flex min-h-9 items-center text-sm text-white/75 hover:text-white">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="inline-flex min-h-9 items-center text-sm text-white/75 hover:text-white">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-12 text-xs text-white/45">
          © {new Date().getFullYear()} {site.name}
        </p>
      </div>
    </footer>
  );
}
