"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import {
  listTeamMessagesAction,
  markConversationReadAction,
  openTeamConversationAction,
  sendTeamMessageAction,
  type MessageView,
} from "@/server/messages";
import { cn } from "@/lib/cn";

/** Poll interval while the conversation is on screen and the tab is visible (WORKSPACE decision: no push transport). */
const POLL_MS = 15_000;
const SHOW_COUNTER_WITHIN = 200;

type ConversationState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; conversationId: string; messages: MessageView[]; hasEarlier: boolean; maxLength: number };

function mergeMessages(current: MessageView[], incoming: MessageView[]): MessageView[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

const timeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The workspace Team channel: persisted messages between members of this
 * organization. Bodies are rendered as plain text (React escapes them), so
 * markup in a message is shown literally and never interpreted.
 */
export function TeamConversation({ orgSlug, orgName, onUnreadChange }: { orgSlug: string; orgName: string; onUnreadChange: (unread: number) => void }) {
  const [state, setState] = useState<ConversationState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreFromHeight = useRef<number | null>(null);
  const lastMarked = useRef<string | null>(null);
  const composerId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    let cancelled = false;
    openTeamConversationAction(orgSlug).then(
      (res) => {
        if (cancelled) return;
        setState(
          res.ok
            ? { status: "ready", conversationId: res.data.conversationId, messages: res.data.messages, hasEarlier: res.data.hasEarlier, maxLength: res.data.maxLength }
            : { status: "error", message: res.error },
        );
      },
      () => {
        if (!cancelled) setState({ status: "error", message: "Messages couldn't load. Check your connection and try again." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [orgSlug, reloadKey]);

  const conversationId = state.status === "ready" ? state.conversationId : null;

  const refresh = useCallback(() => {
    if (!conversationId || document.visibilityState !== "visible") return;
    listTeamMessagesAction(orgSlug, { conversationId }).then(
      (res) => {
        if (!res.ok) return;
        setState((prev) => (prev.status === "ready" ? { ...prev, messages: mergeMessages(prev.messages, res.data.messages) } : prev));
      },
      () => undefined,
    );
  }, [orgSlug, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const interval = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [conversationId, refresh]);

  const messages = state.status === "ready" ? state.messages : null;
  const newest = messages?.at(-1);

  // Mark read up to the newest message actually rendered.
  useEffect(() => {
    if (!conversationId || !newest || lastMarked.current === newest.createdAt) return;
    lastMarked.current = newest.createdAt;
    markConversationReadAction(orgSlug, { conversationId, through: newest.createdAt }).then(
      (res) => {
        if (res.ok) onUnreadChange(res.data.unread);
      },
      () => undefined,
    );
  }, [orgSlug, conversationId, newest, onUnreadChange]);

  // Keep the view pinned to the latest message unless the reader scrolled up; keep position when older messages load.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restoreFromHeight.current !== null) {
      el.scrollTop += el.scrollHeight - restoreFromHeight.current;
      restoreFromHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function loadEarlier() {
    if (state.status !== "ready" || !state.messages.length) return;
    setLoadingEarlier(true);
    try {
      const res = await listTeamMessagesAction(orgSlug, { conversationId: state.conversationId, before: state.messages[0].createdAt });
      if (res.ok) {
        restoreFromHeight.current = scroller.current?.scrollHeight ?? null;
        setState((prev) => (prev.status === "ready" ? { ...prev, messages: mergeMessages(prev.messages, res.data.messages), hasEarlier: res.data.hasEarlier } : prev));
      }
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "ready" || sending || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await sendTeamMessageAction(orgSlug, { conversationId: state.conversationId, body: draft });
      if (res.ok) {
        setDraft("");
        stickToBottom.current = true;
        setState((prev) => (prev.status === "ready" ? { ...prev, messages: mergeMessages(prev.messages, [res.data]) } : prev));
      } else {
        setSendError(res.fieldErrors?.body ?? res.error);
      }
    } catch {
      setSendError("Your message wasn't sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
        <span className="sr-only">Loading messages…</span>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="ml-auto h-10 w-1/2" />
        <Skeleton className="h-10 w-3/5" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p className="text-sm text-ink">{state.message}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setState({ status: "loading" });
            setReloadKey((k) => k + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const remaining = state.maxLength - draft.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        <p className="mb-3 text-center text-[11px] text-muted">Visible to everyone in {orgName}.</p>
        {state.hasEarlier ? (
          <div className="mb-3 flex justify-center">
            <Button variant="ghost" size="sm" onClick={loadEarlier} loading={loadingEarlier}>
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {state.messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello to your team.</p>
        ) : (
          <div role="log" aria-live="polite" aria-label="Team messages">
            <ol className="flex flex-col gap-3">
              {state.messages.map((m) => (
                <li key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
                  <div className="flex items-baseline gap-2 text-[11px] text-muted">
                    <span className="font-medium text-ink-2">{m.mine ? "You" : m.authorName}</span>
                    <time dateTime={m.createdAt}>{timeFormat.format(new Date(m.createdAt))}</time>
                  </div>
                  <p className={cn("mt-0.5 max-w-[85%] whitespace-pre-wrap break-words rounded-[12px] px-3 py-2 text-sm", m.mine ? "bg-ink text-white" : "bg-selected text-ink")}>
                    {m.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <form onSubmit={send} className="shrink-0 border-t border-line p-2">
        <label htmlFor={composerId} className="sr-only">
          Message Team
        </label>
        <textarea
          id={composerId}
          rows={2}
          value={draft}
          maxLength={state.maxLength}
          onChange={(event) => {
            setDraft(event.target.value);
            if (sendError) setSendError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          aria-describedby={sendError ? `${hintId} ${errorId}` : hintId}
          aria-invalid={sendError ? true : undefined}
          placeholder="Message Team"
          className="block max-h-40 min-h-11 w-full resize-y rounded-[8px] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-ink-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
        />
        {sendError ? (
          <p id={errorId} role="alert" className="mt-1 text-[12px] text-danger">
            {sendError}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p id={hintId} className={cn("text-[11px]", remaining <= SHOW_COUNTER_WITHIN ? "text-warning" : "text-muted")}>
            {remaining <= SHOW_COUNTER_WITHIN ? `${remaining.toLocaleString()} characters left` : "Enter to send · Shift+Enter for a new line"}
          </p>
          <Button type="submit" size="sm" loading={sending} disabled={!draft.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
