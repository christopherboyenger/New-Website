import Link from "next/link";
import { ArrowUpRight, ChevronDown, Menu } from "lucide-react";
import { signOutAction } from "@/server/auth/actions";
import { cn } from "@/lib/cn";
import { productSections, startHref } from "./content";
import { DisclosureMenu } from "./disclosure-menu";
import { Wordmark } from "./wordmark";

export interface HeaderViewer {
  name: string;
  email: string;
  initials: string;
}

const navLink =
  "inline-flex h-11 items-center rounded-[8px] px-3 text-sm font-medium text-white/85 transition-colors hover:text-white md:h-9";
const menuItem = "flex min-h-11 items-center rounded-[8px] px-3 text-sm text-white/85 hover:bg-white/10 hover:text-white md:min-h-9";

/** Public header: wordmark, Products disclosure, Pricing, Creators, and account controls. */
export function SiteHeader({ viewer, overlay = false }: { viewer: HeaderViewer | null; overlay?: boolean }) {
  return (
    <header className={cn("z-40 w-full", overlay ? "absolute inset-x-0 top-0" : "relative border-b border-white/10 bg-black")}>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Wordmark />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <DisclosureMenu
            trigger={
              <>
                Products <ChevronDown className="size-3.5" aria-hidden="true" />
              </>
            }
            triggerClassName={cn(navLink, "gap-1")}
          >
            <ProductLinks />
          </DisclosureMenu>
          <Link href="/pricing" className={navLink}>
            Pricing
          </Link>
          <Link href="/creators" className={navLink}>
            Creators
          </Link>
          <div className="ml-3 flex items-center gap-2">{viewer ? <AccountMenu viewer={viewer} /> : <SignedOutActions />}</div>
        </nav>

        <div className="md:hidden">
          <DisclosureMenu
            label="Menu"
            align="end"
            trigger={<Menu className="size-5" aria-hidden="true" />}
            triggerClassName="grid size-11 place-items-center rounded-[8px] text-white hover:bg-white/10"
            panelClassName="w-[min(20rem,calc(100vw-2rem))]"
          >
            <nav aria-label="Main">
              <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-white/50 uppercase">Products</p>
              <ProductLinks />
              <div className="my-1.5 border-t border-white/10" />
              <Link href="/pricing" className={menuItem}>
                Pricing
              </Link>
              <Link href="/creators" className={menuItem}>
                Creators
              </Link>
              <Link href="/how-it-works" className={menuItem}>
                How it works
              </Link>
              <div className="my-1.5 border-t border-white/10" />
              {viewer ? (
                <AccountItems viewer={viewer} />
              ) : (
                <>
                  <Link href="/auth/sign-in" className={menuItem}>
                    Sign in
                  </Link>
                  <Link href={startHref("nav")} className={cn(menuItem, "font-medium text-white")}>
                    Get started
                  </Link>
                </>
              )}
            </nav>
          </DisclosureMenu>
        </div>
      </div>
    </header>
  );
}

function ProductLinks() {
  return (
    <ul>
      {productSections.map((section) => (
        <li key={section.id}>
          <Link href={`/#${section.id}`} className={menuItem}>
            {section.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SignedOutActions() {
  return (
    <>
      <Link href="/auth/sign-in" className={navLink}>
        Sign in
      </Link>
      <Link
        href={startHref("nav")}
        className="inline-flex h-9 items-center gap-1 rounded-[8px] bg-accent px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Get started <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </>
  );
}

function AccountMenu({ viewer }: { viewer: HeaderViewer }) {
  return (
    <DisclosureMenu
      label={`Account menu for ${viewer.name}`}
      align="end"
      trigger={<span aria-hidden="true">{viewer.initials}</span>}
      triggerClassName="grid size-9 place-items-center rounded-[8px] bg-white/15 text-sm font-semibold text-white hover:bg-white/25"
    >
      <AccountItems viewer={viewer} />
    </DisclosureMenu>
  );
}

function AccountItems({ viewer }: { viewer: HeaderViewer }) {
  return (
    <>
      <div className="px-3 pt-2 pb-1.5">
        <p className="truncate text-sm font-medium text-white">{viewer.name}</p>
        <p className="truncate text-xs text-white/55">{viewer.email}</p>
      </div>
      <Link href="/home" className={menuItem}>
        Open workspace
      </Link>
      <form action={signOutAction}>
        <button type="submit" className={cn(menuItem, "w-full text-left")}>
          Sign out
        </button>
      </form>
    </>
  );
}
