"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronsUpDown,
  CreditCard,
  Home,
  Megaphone,
  Palette,
  Plug,
  Radio,
  Search,
  Target,
  Users,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

export interface SidebarProps {
  orgSlug: string;
  orgName: string;
  canViewBilling: boolean;
  version: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string, base: string) => boolean;
}

/** Workspace navigation (256px expanded). Mirrors the observed information architecture. */
export function Sidebar({ orgSlug, orgName, canViewBilling, version }: SidebarProps) {
  const pathname = usePathname();
  const base = `/home/${orgSlug}`;
  const [campaignsOpen, setCampaignsOpen] = useState(true);

  const primary: NavItem[] = [
    { href: base, label: "Home", icon: Home, match: (p, b) => p === b },
    { href: `${base}/live`, label: "Live", icon: Radio, match: (p, b) => p.startsWith(`${b}/live`) },
  ];
  const campaignChildren = [
    { href: `${base}/campaigns`, label: "Organic", match: (p: string) => p.startsWith(`${base}/campaigns`) },
    { href: `${base}/ads`, label: "Ads", match: (p: string) => p.startsWith(`${base}/ads`) && !p.startsWith(`${base}/ad-settings`) },
  ];
  const afterCampaigns: NavItem[] = [{ href: `${base}/creators`, label: "Creators", icon: Users, match: (p, b) => p.startsWith(`${b}/creators`) }];
  const settings: NavItem[] = [
    { href: `${base}/integrations`, label: "Integrations", icon: Plug, match: (p, b) => p.startsWith(`${b}/integrations`) },
    { href: `${base}/ad-settings`, label: "Ad settings", icon: Megaphone, match: (p, b) => p.startsWith(`${b}/ad-settings`) },
    { href: `${base}/members`, label: "Members", icon: UserRoundCog, match: (p, b) => p.startsWith(`${b}/members`) },
    { href: `${base}/branding`, label: "Branding", icon: Palette, match: (p, b) => p.startsWith(`${b}/branding`) },
    ...(canViewBilling ? [{ href: `${base}/billing`, label: "Billing", icon: CreditCard, match: (p: string, b: string) => p.startsWith(`${b}/billing`) }] : []),
  ];

  return (
    <nav aria-label="Workspace" className="flex h-full w-[var(--spacing-sidebar)] flex-col gap-3 bg-canvas px-2.5 py-3 text-sm text-ink-2">
      <button type="button" className="flex h-8 items-center justify-between rounded-[10px] px-2 text-left font-semibold text-ink hover:bg-hover" aria-label={`Current workspace: ${orgName}`}>
        <span className="truncate">{orgName}</span>
        <ChevronsUpDown className="size-3.5 text-muted" aria-hidden="true" />
      </button>

      <button type="button" className="flex h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-2 text-left text-[13px] text-muted hover:border-line-strong" aria-label="Search">
        <Search className="size-3.5" aria-hidden="true" />
        <span className="flex-1">Search for anything…</span>
        <kbd className="rounded border border-line px-1 text-[11px]">⌘K</kbd>
      </button>

      <ul className="flex flex-col gap-0.5">
        {primary.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname, base)} base={base} />
        ))}
        <li>
          <button
            type="button"
            aria-expanded={campaignsOpen}
            onClick={() => setCampaignsOpen((v) => !v)}
            className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2 hover:bg-hover hover:text-ink"
          >
            <Target className="size-4" aria-hidden="true" />
            <span className="flex-1 text-left">Campaigns</span>
            <ChevronDown className={cn("size-3.5 transition-transform", !campaignsOpen && "-rotate-90")} aria-hidden="true" />
          </button>
          {campaignsOpen ? (
            <ul className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2">
              {campaignChildren.map((child) => {
                const active = child.match(pathname);
                return (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex h-7 items-center rounded-[10px] px-2 hover:bg-hover hover:text-ink", active && "bg-selected font-medium text-ink")}
                    >
                      {child.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </li>
        {afterCampaigns.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname, base)} base={base} />
        ))}
      </ul>

      <div>
        <p className="px-2 pb-1 text-xs text-muted">Settings</p>
        <ul className="flex flex-col gap-0.5">
          {settings.map((item) => (
            <NavLink key={item.href} item={item} active={item.match(pathname, base)} base={base} />
          ))}
          <li>
            <span className="flex h-8 items-center gap-2 rounded-[10px] px-2 text-ink-2">
              <BookOpen className="size-4" aria-hidden="true" /> Resources
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-auto px-2 text-[11px] text-subtle">{version ? `v${version}` : null}</div>
    </nav>
  );
}

function NavLink({ item, active, base }: { item: NavItem; active: boolean; base: string }) {
  void base;
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn("flex h-8 items-center gap-2 rounded-[10px] px-2 hover:bg-hover hover:text-ink", active && "bg-selected font-medium text-ink")}
      >
        <Icon className="size-4" aria-hidden="true" />
        {item.label}
      </Link>
    </li>
  );
}
