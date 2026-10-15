"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clapperboard,
  CreditCard,
  ExternalLink,
  Home,
  LogOut,
  Mail,
  Megaphone,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Radio,
  Search,
  Sprout,
  Target,
  UserRoundCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { signOutAction } from "@/server/auth/actions";
import { cn } from "@/lib/cn";
import { Menu, MenuSeparator, menuItemClass } from "./menu";
import { useIsApplePlatform } from "./use-media-query";

export interface WorkspaceIdentity {
  slug: string;
  name: string;
}

export interface ResourceLinks {
  docsUrl: string | null;
  supportEmail: string | null;
}

export interface SidebarProps {
  org: WorkspaceIdentity;
  organizations: WorkspaceIdentity[];
  user: { name: string; email: string };
  canViewBilling: boolean;
  version: string | null;
  resources: ResourceLinks;
  /** "desktop": fixed column (256px, or a 56px icon rail when collapsed). "drawer": full labels inside the mobile drawer. */
  variant: "desktop" | "drawer";
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onClose?: () => void;
  onOpenSearch: () => void;
  /** Called after a navigation link is activated (the drawer closes itself). */
  onNavigate?: () => void;
}

/** Hover treatment for rows that are not the current page (the selected fill stays on hover). */
const rowHover = "hover:bg-hover hover:text-ink";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

/** Workspace navigation. Information architecture follows the observed shell (L01, B08/B09). */
export function Sidebar(props: SidebarProps) {
  const { org, organizations, user, canViewBilling, version, resources, variant, collapsed, onToggleCollapsed, onClose, onOpenSearch, onNavigate } = props;
  const pathname = usePathname();
  const base = `/home/${org.slug}`;
  const rail = variant === "desktop" && collapsed;
  const touch = variant === "drawer";
  const [campaignsOpen, setCampaignsOpen] = useState(true);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const campaignsId = useId();
  const resourcesId = useId();

  const under = (path: string) => pathname === `${base}${path}` || pathname.startsWith(`${base}${path}/`);
  const primary: NavItem[] = [
    { href: base, label: "Home", icon: Home, active: pathname === base },
    { href: `${base}/live`, label: "Live", icon: Radio, active: under("/live") },
  ];
  const campaignChildren: NavItem[] = [
    { href: `${base}/campaigns`, label: "Organic", icon: Sprout, active: under("/campaigns") },
    { href: `${base}/ads`, label: "Ads", icon: Clapperboard, active: under("/ads") },
  ];
  const creators: NavItem = { href: `${base}/creators`, label: "Creators", icon: Users, active: under("/creators") };
  const settings: NavItem[] = [
    { href: `${base}/integrations`, label: "Integrations", icon: Plug, active: under("/integrations") },
    { href: `${base}/ad-settings`, label: "Ad settings", icon: Megaphone, active: under("/ad-settings") },
    { href: `${base}/members`, label: "Members", icon: UserRoundCog, active: under("/members") },
    { href: `${base}/branding`, label: "Branding", icon: Palette, active: under("/branding") },
    ...(canViewBilling ? [{ href: `${base}/billing`, label: "Billing", icon: CreditCard, active: under("/billing") }] : []),
  ];

  const rowHeight = touch ? "min-h-11" : "h-8";
  const subRowHeight = touch ? "min-h-11" : "h-7";
  const rowClass = cn("flex items-center gap-2 rounded-[10px]", rail ? "w-10 justify-center" : "px-2");

  return (
    <div className={cn("flex h-full flex-col bg-canvas py-3 text-sm text-ink-2", rail ? "w-14 items-center px-2" : variant === "drawer" ? "w-full px-3" : "w-[var(--spacing-sidebar)] px-2.5")}>
      <div className={cn("flex gap-1", rail ? "flex-col items-center" : "items-center")}>
        <div className={rail ? undefined : "min-w-0 flex-1"}>
          <BrandSwitcher org={org} organizations={organizations} rail={rail} touch={touch} />
        </div>
        {variant === "desktop" ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
          </button>
        ) : (
          <button type="button" onClick={onClose} aria-label="Close navigation" className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-hover hover:text-ink">
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <SearchTrigger rail={rail} touch={touch} onClick={onOpenSearch} />

      <nav aria-label="Workspace" className={cn("mt-3 min-h-0 flex-1 overflow-y-auto", rail && "flex flex-col items-center")}>
        <ul className={cn("flex flex-col gap-0.5", rail && "items-center")}>
          {primary.map((item) => (
            <NavRow key={item.href} item={item} rail={rail} className={cn(rowClass, rowHeight)} onNavigate={onNavigate} />
          ))}
          {rail ? (
            campaignChildren.map((item) => <NavRow key={item.href} item={item} rail className={cn(rowClass, rowHeight)} onNavigate={onNavigate} />)
          ) : (
            <li>
              <button
                type="button"
                aria-expanded={campaignsOpen}
                aria-controls={campaignsId}
                onClick={() => setCampaignsOpen((v) => !v)}
                className={cn(rowClass, rowHeight, rowHover, "w-full")}
              >
                <Target className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">Campaigns</span>
                <ChevronDown className={cn("size-3.5 text-muted transition-transform", campaignsOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {campaignsOpen ? (
                <ul id={campaignsId} className="ml-[15px] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2">
                  {campaignChildren.map((item) => (
                    <NavRow key={item.href} item={item} rail={false} hideIcon className={cn(rowClass, subRowHeight)} onNavigate={onNavigate} />
                  ))}
                </ul>
              ) : null}
            </li>
          )}
          <NavRow item={creators} rail={rail} className={cn(rowClass, rowHeight)} onNavigate={onNavigate} />
        </ul>

        {rail ? <div className="my-3 h-px w-8 bg-line" aria-hidden="true" /> : <p className="mt-5 px-2 pb-1 text-xs text-muted">Settings</p>}
        <ul className={cn("flex flex-col gap-0.5", rail && "items-center")} aria-label={rail ? "Settings" : undefined}>
          {settings.map((item) => (
            <NavRow key={item.href} item={item} rail={rail} className={cn(rowClass, rowHeight)} onNavigate={onNavigate} />
          ))}
          <li>
            <button
              type="button"
              aria-expanded={rail ? false : resourcesOpen}
              aria-controls={rail ? undefined : resourcesId}
              title={rail ? "Resources" : undefined}
              onClick={() => {
                if (rail) {
                  setResourcesOpen(true);
                  onToggleCollapsed?.();
                } else {
                  setResourcesOpen((v) => !v);
                }
              }}
              className={cn(rowClass, rowHeight, rowHover, !rail && "w-full")}
            >
              <BookOpen className="size-4 shrink-0" aria-hidden="true" />
              <span className={rail ? "sr-only" : "flex-1 text-left"}>Resources</span>
              {rail ? null : <ChevronDown className={cn("size-3.5 text-muted transition-transform", resourcesOpen && "rotate-180")} aria-hidden="true" />}
            </button>
            {resourcesOpen && !rail ? <ResourcesList id={resourcesId} resources={resources} rowClass={cn(rowClass, subRowHeight, rowHover)} /> : null}
          </li>
        </ul>
      </nav>

      <div className={cn("mt-3 flex flex-col gap-2", rail && "items-center")}>
        <UserMenu user={user} rail={rail} touch={touch} />
        {version ? <p className="text-center text-[11px] text-subtle">v{version}</p> : null}
      </div>
    </div>
  );
}

function NavRow({ item, rail, hideIcon, className, onNavigate }: { item: NavItem; rail: boolean; hideIcon?: boolean; className: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={item.active ? "page" : undefined}
        title={rail ? item.label : undefined}
        onClick={onNavigate}
        className={cn(className, item.active ? "bg-selected font-medium text-ink" : rowHover)}
      >
        {hideIcon ? null : <Icon className="size-4 shrink-0" aria-hidden="true" />}
        <span className={rail ? "sr-only" : "truncate"}>{item.label}</span>
      </Link>
    </li>
  );
}

function SearchTrigger({ rail, touch, onClick }: { rail: boolean; touch: boolean; onClick: () => void }) {
  const apple = useIsApplePlatform();
  const keys = apple ? ["⌘", "K"] : ["Ctrl", "K"];
  if (rail) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        title={`Search (${keys.join(" ")})`}
        className="mt-2 inline-flex size-10 items-center justify-center rounded-[8px] border border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
      >
        <Search className="size-4" aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "mt-2 flex w-full items-center gap-2 rounded-[8px] border border-line bg-surface px-2 text-left text-[13px] text-muted hover:border-line-strong",
        touch ? "min-h-11" : "h-8",
      )}
    >
      <Search className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">Search for anything…</span>
      <span className="flex shrink-0 gap-0.5" aria-hidden="true">
        {keys.map((k) => (
          <kbd key={k} className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-line px-1 font-sans text-[10px] leading-none text-muted">
            {k}
          </kbd>
        ))}
      </span>
    </button>
  );
}

function ResourcesList({ id, resources, rowClass }: { id: string; resources: ResourceLinks; rowClass: string }) {
  const { docsUrl, supportEmail } = resources;
  return (
    <ul id={id} className="ml-[15px] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2">
      {docsUrl ? (
        <li>
          <a href={docsUrl} target="_blank" rel="noopener noreferrer" className={rowClass}>
            <span className="flex-1 truncate">Documentation</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </li>
      ) : null}
      {supportEmail ? (
        <li>
          <a href={`mailto:${supportEmail}`} className={rowClass}>
            <span className="flex-1 truncate">Contact support</span>
            <Mail className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          </a>
        </li>
      ) : null}
      {!docsUrl && !supportEmail ? (
        <li className="px-2 py-1.5 text-xs leading-5 text-muted">Documentation isn&apos;t published yet.</li>
      ) : null}
    </ul>
  );
}

function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-ink text-[11px] font-semibold uppercase text-white", className)}>
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function BrandSwitcher({ org, organizations, rail, touch }: { org: WorkspaceIdentity; organizations: WorkspaceIdentity[]; rail: boolean; touch: boolean }) {
  const groupLabelId = useId();
  return (
    <Menu
      buttonLabel={`Switch brand (current: ${org.name})`}
      buttonContent={
        rail ? (
          <Initial name={org.name} className="size-7" />
        ) : (
          <>
            <span className="truncate">{org.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          </>
        )
      }
      buttonClassName={cn(
        "flex items-center rounded-[10px] font-semibold text-ink hover:bg-hover",
        rail ? "size-10 justify-center" : "w-full gap-1.5 px-2 text-left",
        !rail && (touch ? "min-h-11" : "h-8"),
      )}
      menuLabel="Workspaces"
      placement={rail ? "right-top" : "below"}
    >
      <div role="group" aria-labelledby={groupLabelId}>
        <div id={groupLabelId} className="px-2 pb-1 pt-1.5 text-xs text-muted">
          Workspaces
        </div>
        {organizations.map((o) => {
          const current = o.slug === org.slug;
          return (
            <Link key={o.slug} href={`/home/${o.slug}`} role="menuitemradio" aria-checked={current} tabIndex={-1} className={menuItemClass}>
              <Initial name={o.name} className="size-5 text-[10px]" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {current ? <Check className="size-3.5 shrink-0 text-ink" aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </div>
      <MenuSeparator />
      <Link href="/onboarding?new=1" role="menuitem" tabIndex={-1} className={menuItemClass}>
        <Plus className="size-4 shrink-0" aria-hidden="true" />
        Create workspace
      </Link>
    </Menu>
  );
}

function UserMenu({ user, rail, touch }: { user: { name: string; email: string }; rail: boolean; touch: boolean }) {
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || user.email.charAt(0).toUpperCase();
  return (
    <Menu
      buttonLabel={`Account: ${user.name}`}
      buttonContent={
        <>
          <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-selected text-[11px] font-semibold text-ink-2">
            {initials}
          </span>
          {rail ? null : <span className="min-w-0 flex-1 truncate text-left text-[13px] text-ink-2">{user.name}</span>}
        </>
      }
      buttonClassName={cn("flex items-center gap-2 rounded-[10px] hover:bg-hover", rail ? "size-10 justify-center" : cn("w-full px-1.5", touch ? "min-h-11" : "h-10"))}
      menuLabel="Account"
      placement={rail ? "right-bottom" : "above"}
    >
      <div className="px-2 py-1.5">
        <p className="truncate font-medium text-ink">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <MenuSeparator />
      <form action={signOutAction}>
        <button type="submit" role="menuitem" tabIndex={-1} className={menuItemClass}>
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </Menu>
  );
}
