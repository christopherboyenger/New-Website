"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Menu as MenuIcon, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { MessagesDock, type MessagesDockProps } from "./messages-dock";
import { SearchDialog } from "./search-dialog";
import { setSidebarCollapsedAction } from "./shell-actions";
import { Sidebar, type ResourceLinks, type WorkspaceIdentity } from "./sidebar";
import { DESKTOP_QUERY } from "./use-media-query";

export interface WorkspaceShellProps {
  org: WorkspaceIdentity;
  organizations: WorkspaceIdentity[];
  user: { name: string; email: string };
  canViewBilling: boolean;
  version: string | null;
  resources: ResourceLinks;
  initialCollapsed: boolean;
  messages: Omit<MessagesDockProps, "orgSlug" | "orgName">;
  /** Rendered above the page inside the main panel (e.g. the email verification banner). */
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * Ordinary workspace shell: sidebar (256px, or a 56px icon rail), main
 * panel, global search (⌘K / Ctrl+K) and the messages dock. Below 768px the
 * sidebar moves into a modal drawer opened from a top bar.
 */
export function WorkspaceShell({ org, organizations, user, canViewBilling, version, resources, initialCollapsed, messages, banner, children }: WorkspaceShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDrawerOpen(false);
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    setSidebarCollapsedAction(org.slug, next).catch(() => undefined);
  }

  const openSearch = useCallback(() => {
    setDrawerOpen(false);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const sidebarProps = { org, organizations, user, canViewBilling, version, resources, onOpenSearch: openSearch };

  return (
    <div className={cn("flex min-h-dvh bg-canvas [--shell-sidebar-w:0px]", collapsed ? "md:[--shell-sidebar-w:56px]" : "md:[--shell-sidebar-w:256px]")}>
      <a
        href="#main"
        className="sr-only z-50 rounded-[8px] bg-ink px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <div className="sticky top-0 hidden h-dvh shrink-0 md:block">
        <Sidebar {...sidebarProps} variant="desktop" collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:flex-row md:gap-2 md:py-2 md:pr-2">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-canvas px-2 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="inline-flex size-11 items-center justify-center rounded-[10px] text-ink-2 hover:bg-hover"
          >
            <MenuIcon className="size-5" aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold text-ink">{org.name}</p>
          <button type="button" onClick={openSearch} aria-label="Search" className="inline-flex size-11 items-center justify-center rounded-[10px] text-ink-2 hover:bg-hover">
            <Search className="size-5" aria-hidden="true" />
          </button>
        </header>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-surface pb-24 focus:outline-none md:min-h-[calc(100dvh-1rem)] md:rounded-[12px] md:border md:border-line">
          {banner}
          {children}
        </main>

        <MessagesDock {...messages} orgSlug={org.slug} orgName={org.name} />
      </div>

      <NavigationDrawer open={drawerOpen} onClose={closeDrawer}>
        <Sidebar {...sidebarProps} variant="drawer" collapsed={false} onClose={closeDrawer} onNavigate={closeDrawer} />
      </NavigationDrawer>
      <SearchDialog open={searchOpen} onClose={closeSearch} orgSlug={org.slug} />
    </div>
  );
}

/** Modal navigation drawer for small screens (native <dialog>: focus contained, Escape closes, focus returns to the menu button). */
function NavigationDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      returnFocus.current?.focus?.();
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  // A drawer left open while the window grows past the breakpoint is closed.
  useEffect(() => {
    if (!open) return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (mql.matches) ref.current?.close();
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      className="m-0 h-dvh max-h-dvh w-[min(300px,88vw)] max-w-none border-r border-line bg-canvas p-0 md:hidden"
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
