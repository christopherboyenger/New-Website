"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AlertCircle, BookOpenText, FileText, Loader2, PlaySquare, Search, Target, UserRound, type LucideIcon } from "lucide-react";
import { searchWorkspaceAction, type SearchResultItem, type SearchResultKind, type SearchResults } from "@/server/search";
import { cn } from "@/lib/cn";

/**
 * Command-style global search (L24). Opens from the sidebar trigger and
 * ⌘K / Ctrl+K. Combobox + listbox semantics: focus stays in the input and
 * aria-activedescendant follows ↑/↓; Enter opens; Escape closes and the
 * opener regains focus.
 */
export interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
}

export function SearchDialog({ open, onClose, orgSlug }: SearchDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

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

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="mx-auto mb-auto mt-[8vh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-[14px] border border-line bg-surface p-0 text-ink shadow-2xl"
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <h2 id={titleId} className="sr-only">
        Search
      </h2>
      {open ? <SearchPanel orgSlug={orgSlug} onDone={() => ref.current?.close()} /> : null}
    </dialog>
  );
}

type SearchState =
  | { status: "loading"; results: SearchResults | null }
  | { status: "ready"; results: SearchResults }
  | { status: "error"; results: SearchResults | null; message: string };

const kindIcons: Record<SearchResultKind, LucideIcon> = {
  page: FileText,
  campaign: Target,
  playbook: BookOpenText,
  post: PlaySquare,
  creator: UserRound,
};

const DEBOUNCE_MS = 200;

function SearchPanel({ orgSlug, onDone }: { orgSlug: string; onDone: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "loading", results: null });
  const [activeIndex, setActiveIndex] = useState(0);
  const sequence = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const runSearch = useCallback(
    (value: string) => {
      const current = ++sequence.current;
      searchWorkspaceAction(orgSlug, value).then(
        (result) => {
          if (current !== sequence.current) return;
          if (result.ok) {
            setState({ status: "ready", results: result.data });
            setActiveIndex(0);
          } else {
            setState((prev) => ({ status: "error", results: prev.results, message: result.error }));
          }
        },
        () => {
          if (current !== sequence.current) return;
          setState((prev) => ({ status: "error", results: prev.results, message: "Search isn't available right now. Check your connection and try again." }));
        },
      );
    },
    [orgSlug],
  );

  useEffect(() => {
    runSearch("");
    return () => window.clearTimeout(timer.current);
  }, [runSearch]);

  function onQueryChange(value: string) {
    setQuery(value);
    setState((prev) => ({ status: "loading", results: prev.results }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => runSearch(value), DEBOUNCE_MS);
  }

  const results = state.results;
  const items: SearchResultItem[] = results ? results.groups.flatMap((g) => g.items) : [];
  const settled = state.status === "ready";
  const activeItem = settled ? items[activeIndex] : undefined;

  useEffect(() => {
    if (activeItem) document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeItem, activeIndex, baseId]);

  function openItem(item: SearchResultItem) {
    onDone();
    router.push(item.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!settled || items.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => (i + delta + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeItem) openItem(activeItem);
    } else if (event.key === "Home" && event.ctrlKey && items.length) {
      setActiveIndex(0);
    } else if (event.key === "End" && event.ctrlKey && items.length) {
      setActiveIndex(items.length - 1);
    }
  }

  const trimmed = query.trim();
  let status: string;
  if (state.status === "loading") status = "Searching…";
  else if (state.status === "error") status = state.message;
  else if (items.length === 0) status = trimmed ? `No matches for “${trimmed}”.` : "Nothing to show yet.";
  else status = `${items.length} ${items.length === 1 ? "result" : "results"}${trimmed ? ` for “${trimmed}”` : ""}.`;

  const groupOffsets = (results?.groups ?? []).map((_, g, all) => all.slice(0, g).reduce((sum, prev) => sum + prev.items.length, 0));
  return (
    <div className="flex max-h-[min(80dvh,560px)] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3">
        {state.status === "loading" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
        )}
        <input
          type="text"
          role="combobox"
          aria-label="Search"
          aria-expanded={settled && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search campaigns, playbooks, posts, creators, and pages…"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-subtle focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded-[4px] border border-line px-1.5 py-0.5 font-sans text-[11px] text-muted sm:inline-block">Esc</kbd>
      </div>

      <p role="status" aria-live="polite" className={cn("px-4 pt-3 text-[13px]", state.status === "error" ? "text-danger" : "sr-only")}>
        {state.status === "error" ? <AlertCircle className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" /> : null}
        {status}
      </p>
      {state.status === "error" ? (
        <div className="px-4 pt-2">
          <button type="button" onClick={() => onQueryChange(query)} className="rounded-[8px] border border-line px-2.5 py-1 text-[13px] text-ink hover:bg-hover">
            Try again
          </button>
        </div>
      ) : null}

      <div id={listId} role="listbox" aria-label="Suggestions" aria-busy={state.status === "loading"} className={cn("min-h-0 flex-1 overflow-y-auto p-2", state.status === "loading" && results && "opacity-60")}>
        {results?.groups.map((group, g) => (
          <div key={group.kind} role="group" aria-labelledby={`${baseId}-${group.kind}`} className="pb-1">
            <div id={`${baseId}-${group.kind}`} className="px-2 pb-1 pt-2 text-xs font-medium text-muted">
              {group.label}
            </div>
            {group.items.map((item, position) => {
              const i = groupOffsets[g] + position;
              const Icon = kindIcons[item.kind];
              const selected = settled && i === activeIndex;
              return (
                <div
                  key={item.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => settled && setActiveIndex(i)}
                  onClick={() => openItem(item)}
                  className={cn("flex min-h-10 cursor-pointer items-center gap-3 rounded-[8px] px-2 py-1.5", selected ? "bg-selected text-ink" : "text-ink-2")}
                >
                  <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.title}</span>
                    {item.subtitle ? <span className="block truncate text-xs text-muted">{item.subtitle}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {settled && items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium text-ink">{trimmed ? `No matches for “${trimmed}”` : "Start typing to search"}</p>
            <p className="mt-1 text-[13px] text-muted">Try a campaign or playbook name, a creator, an @handle, or a page like Billing.</p>
          </div>
        ) : null}
        {!results && state.status === "loading" ? <p className="px-3 py-8 text-center text-[13px] text-muted">Searching…</p> : null}
      </div>

      <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted sm:flex" aria-hidden="true">
        <span className="flex items-center gap-1">
          <kbd className="rounded-[4px] border border-line px-1 font-sans">↑</kbd>
          <kbd className="rounded-[4px] border border-line px-1 font-sans">↓</kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded-[4px] border border-line px-1 font-sans">↵</kbd> open
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded-[4px] border border-line px-1 font-sans">esc</kbd> close
        </span>
      </div>
    </div>
  );
}
