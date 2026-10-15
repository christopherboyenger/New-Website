"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Bot, ChevronLeft, LifeBuoy, Maximize2, MessagesSquare, Minus, PanelRight, UsersRound } from "lucide-react";
import { PlanBadge } from "@/components/ui/feedback";
import { getUnreadMessageCountAction, setMessagesDockStateAction } from "@/server/messages";
import type { MessagesDockState } from "@/server/home";
import { cn } from "@/lib/cn";
import { TeamConversation } from "./team-conversation";
import { DESKTOP_QUERY, isDesktopViewport, useMediaQuery } from "./use-media-query";
import { useModalDialog } from "./use-modal-dialog";

/** Unread badge refresh while the Team conversation is not on screen. */
const UNREAD_POLL_MS = 60_000;

export interface MessagesDockProps {
  orgSlug: string;
  orgName: string;
  initialState: MessagesDockState;
  /** Null when the count could not be loaded (the badge is omitted rather than shown as 0). */
  initialUnread: number | null;
  creatorMessagingIncluded: boolean;
  /** Plan that includes creator messaging (display name from commercial policy). */
  creatorMessagingPlanName: string;
  /** Billing link for "See plans", or null when the viewer cannot see billing. */
  billingHref: string | null;
  supportEmail: string | null;
}

/**
 * Messages dock (evidence audit item 1). Minimized launcher, floating window
 * and docked side panel are mutually exclusive: only the active presentation
 * is rendered, so hidden panels never sit in the accessibility tree. Phones
 * use a full-width modal panel opened from the launcher for this visit only.
 */
export function MessagesDock(props: MessagesDockProps) {
  const { orgSlug, orgName, initialState, initialUnread, creatorMessagingIncluded, creatorMessagingPlanName, billingHref, supportEmail } = props;
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  const [dockState, setDockState] = useState<MessagesDockState>(initialState);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<"channels" | "team">("channels");
  const [unread, setUnread] = useState<number | null>(initialUnread);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<"panel" | "launcher" | null>(null);

  const panelOpen = isDesktop ? dockState !== "minimized" : mobileOpen;
  const conversationOnScreen = panelOpen && view === "team";

  // Opening moves focus to the panel heading; minimizing returns it to the launcher.
  useEffect(() => {
    if (pendingFocus.current === "panel") headingRef.current?.focus();
    else if (pendingFocus.current === "launcher") launcherRef.current?.focus();
    pendingFocus.current = null;
  }, [panelOpen, dockState, view]);

  const refreshUnread = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    getUnreadMessageCountAction(orgSlug).then(
      (res) => {
        if (res.ok) setUnread(res.data.unread);
      },
      () => undefined,
    );
  }, [orgSlug]);

  // While the Team conversation is on screen it keeps the count current itself.
  useEffect(() => {
    if (conversationOnScreen) return;
    const interval = window.setInterval(refreshUnread, UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", refreshUnread);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshUnread);
    };
  }, [conversationOnScreen, refreshUnread]);

  function persist(next: MessagesDockState) {
    setDockState(next);
    setMessagesDockStateAction(orgSlug, next).catch(() => undefined);
  }

  function open(mode: "floating" | "docked") {
    pendingFocus.current = "panel";
    if (isDesktopViewport()) persist(mode);
    else setMobileOpen(true);
  }

  const minimize = useCallback(() => {
    pendingFocus.current = "launcher";
    setMobileOpen(false);
    if (isDesktopViewport()) {
      setDockState("minimized");
      setMessagesDockStateAction(orgSlug, "minimized").catch(() => undefined);
    }
  }, [orgSlug]);

  function showView(next: "channels" | "team") {
    pendingFocus.current = "panel";
    setView(next);
  }

  const launcher = (
    <div className="pointer-events-none fixed bottom-4 left-[calc(50%_+_var(--shell-sidebar-w,0px)/2)] z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center rounded-full border border-line bg-surface p-1 shadow-[0_4px_16px_rgb(28_25_23/0.12)]">
        <button
          ref={launcherRef}
          type="button"
          onClick={() => open("floating")}
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-ink hover:bg-hover md:h-8 md:px-3"
        >
          Messages
          <UnreadBadge count={unread} />
        </button>
        {/* Window and side-dock presentations exist on larger screens only; phones always use the full-width panel. */}
        {isDesktop ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
            <DockButton label="Open as window" onClick={() => open("floating")}>
              <Maximize2 className="size-3.5" aria-hidden="true" />
            </DockButton>
            <DockButton label="Dock to the side" onClick={() => open("docked")}>
              <PanelRight className="size-3.5" aria-hidden="true" />
            </DockButton>
          </>
        ) : null}
      </div>
    </div>
  );

  const presentation: "mobile" | "floating" | "docked" = !isDesktop ? "mobile" : dockState === "docked" ? "docked" : "floating";
  const placement = {
    mobile: "h-full w-full",
    docked: "sticky top-2 h-[calc(100dvh-1rem)] w-[360px] shrink-0 rounded-[12px] border border-line",
    floating: "fixed bottom-4 right-4 z-40 h-[min(560px,calc(100dvh-2rem))] w-[380px] rounded-[14px] border border-line shadow-2xl",
  }[presentation];

  const panel = (
    <aside
      aria-label="Messages"
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        // The floating window is non-modal; Escape minimizes it. (The phone panel is a modal dialog that handles Escape itself.)
        if (event.key === "Escape" && presentation === "floating") {
          event.preventDefault();
          minimize();
        }
      }}
      className={cn("flex flex-col overflow-hidden bg-surface", placement)}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        {view === "team" ? (
          <DockButton label="Back to channels" onClick={() => showView("channels")}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </DockButton>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <h2 ref={headingRef} tabIndex={-1} className="truncate text-sm font-semibold text-ink focus:outline-none">
            {view === "team" ? "Team" : "All messages"}
          </h2>
          {view === "team" ? <p className="truncate text-[11px] text-muted">Everyone in {orgName}</p> : null}
        </div>
        {presentation === "docked" ? (
          <DockButton label="Open as window" onClick={() => open("floating")}>
            <Maximize2 className="size-3.5" aria-hidden="true" />
          </DockButton>
        ) : null}
        {presentation === "floating" ? (
          <DockButton label="Dock to the side" onClick={() => open("docked")}>
            <PanelRight className="size-3.5" aria-hidden="true" />
          </DockButton>
        ) : null}
        <DockButton label="Minimize messages" onClick={minimize}>
          <Minus className="size-4" aria-hidden="true" />
        </DockButton>
      </div>
      {view === "team" ? (
        <TeamConversation orgSlug={orgSlug} orgName={orgName} onUnreadChange={setUnread} />
      ) : (
        <ChannelList
          orgName={orgName}
          unread={unread}
          onOpenTeam={() => showView("team")}
          creatorMessagingIncluded={creatorMessagingIncluded}
          creatorMessagingPlanName={creatorMessagingPlanName}
          billingHref={billingHref}
          supportEmail={supportEmail}
        />
      )}
    </aside>
  );

  if (presentation === "mobile") {
    return (
      <>
        {mobileOpen ? null : launcher}
        <MobileMessagesSheet open={mobileOpen} onClose={minimize}>
          {mobileOpen ? panel : null}
        </MobileMessagesSheet>
      </>
    );
  }
  return panelOpen ? panel : launcher;
}

/** Full-screen modal panel for phones: the page behind is inert, Escape closes it. */
function MobileMessagesSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { ref } = useModalDialog(open, onClose);
  return (
    <dialog ref={ref} aria-label="Messages" className="m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 md:hidden">
      {children}
    </dialog>
  );
}

function UnreadBadge({ count }: { count: number | null }) {
  if (!count) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

function DockButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink md:size-8"
    >
      {children}
    </button>
  );
}

interface ChannelListProps {
  orgName: string;
  unread: number | null;
  onOpenTeam: () => void;
  creatorMessagingIncluded: boolean;
  creatorMessagingPlanName: string;
  billingHref: string | null;
  supportEmail: string | null;
}

function ChannelList({ orgName, unread, onOpenTeam, creatorMessagingIncluded, creatorMessagingPlanName, billingHref, supportEmail }: ChannelListProps) {
  const [filter, setFilter] = useState("");
  const searchId = useId();
  const term = filter.trim().toLowerCase();

  const channels = [
    {
      key: "team",
      text: `team everyone ${orgName}`,
      node: (
        <button type="button" onClick={onOpenTeam} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-hover">
          <ChannelIcon>
            <UsersRound className="size-4" aria-hidden="true" />
          </ChannelIcon>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Team</span>
            <span className="block truncate text-xs text-muted">Everyone in {orgName}</span>
          </span>
          <UnreadBadge count={unread} />
        </button>
      ),
    },
    {
      key: "agent",
      text: "ai agent assistant",
      node: (
        <UnavailableChannel icon={<Bot className="size-4" aria-hidden="true" />} title="AI agent">
          Not available on this deployment.
        </UnavailableChannel>
      ),
    },
    {
      key: "support",
      text: "support help",
      node: (
        <UnavailableChannel icon={<LifeBuoy className="size-4" aria-hidden="true" />} title="Support">
          {supportEmail ? (
            <>
              Live chat isn&apos;t available here.{" "}
              <a href={`mailto:${supportEmail}`} className="font-medium text-ink underline underline-offset-2">
                Email support
              </a>
            </>
          ) : (
            "Not available on this deployment."
          )}
        </UnavailableChannel>
      ),
    },
    {
      key: "creators",
      text: "message your creators creator messaging",
      node: (
        <UnavailableChannel
          icon={<MessagesSquare className="size-4" aria-hidden="true" />}
          title="Message your creators"
          badge={creatorMessagingIncluded ? null : <PlanBadge planName={creatorMessagingPlanName} />}
        >
          {creatorMessagingIncluded ? (
            "Creator messaging isn't available on this deployment yet."
          ) : (
            <>
              Included with the {creatorMessagingPlanName} plan.
              {billingHref ? (
                <>
                  {" "}
                  <Link href={billingHref} className="font-medium text-ink underline underline-offset-2">
                    See plans
                  </Link>
                </>
              ) : null}
            </>
          )}
        </UnavailableChannel>
      ),
    },
  ];
  const visible = term ? channels.filter((c) => c.text.toLowerCase().includes(term)) : channels;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3 pb-2">
        <label htmlFor={searchId} className="sr-only">
          Search channels
        </label>
        <input
          id={searchId}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search"
          className="h-9 w-full rounded-[8px] border border-line bg-surface px-3 text-sm max-md:min-h-11 text-ink placeholder:text-subtle hover:border-line-strong focus:border-ink-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
        />
      </div>
      {visible.length ? (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Channels">
          {visible.map((c) => (
            <li key={c.key}>{c.node}</li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted">No channels match “{filter.trim()}”.</p>
      )}
    </div>
  );
}

function ChannelIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-selected text-ink-2">{children}</span>;
}

function UnavailableChannel({ icon, title, badge, children }: { icon: ReactNode; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] px-2 py-2.5">
      <ChannelIcon>{icon}</ChannelIcon>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-2">
          {title}
          {badge}
        </p>
        <p className="text-xs leading-5 text-muted">{children}</p>
      </div>
    </div>
  );
}
