"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Redo2, Underline, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { richTextContentClass } from "./rich-text-styles";

/**
 * Description editor (L12): contentEditable with Heading, Subheading, Bold,
 * Italic, Underline, Bulleted list, Numbered list, Link, Undo and Redo, and a
 * live character counter. The browser's editing commands produce the markup;
 * the server sanitizes whatever arrives (src/domain/rich-text.ts), so this
 * component is a convenience, not a security boundary. Pasted content is
 * inserted as plain text.
 */

type Command = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList";

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  block: string;
  canUndo: boolean;
  canRedo: boolean;
}

const emptyState: ToolbarState = { bold: false, italic: false, underline: false, insertUnorderedList: false, insertOrderedList: false, block: "", canUndo: false, canRedo: false };

/** Visible characters, counted the way the server counts them (code points of text content). */
export function countCharacters(element: HTMLElement | null): number {
  return element ? Array.from(element.textContent ?? "").length : 0;
}

function safeLink(value: string): string | null {
  const v = value.trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(v)) return v;
  const candidate = /^https:\/\//i.test(v) ? v : /^[a-z][a-z0-9+.-]*:/i.test(v) ? null : `https://${v}`;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function RichTextEditor({
  id,
  labelId,
  describedById,
  initialHtml,
  placeholder,
  maxChars,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  labelId: string;
  describedById?: string;
  initialHtml: string;
  placeholder: string;
  maxChars: number;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (html: string, characters: number) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [state, setState] = useState<ToolbarState>(emptyState);
  const [count, setCount] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const counterId = useId();
  const linkInputId = useId();

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Server-sanitized HTML only (see BrandingView.descriptionHtml).
    el.innerHTML = initialHtml;
    setCount(countCharacters(el));
  }, [initialHtml]);

  const refreshState = useCallback(() => {
    const el = editorRef.current;
    const selection = document.getSelection();
    if (!el || !selection || !selection.anchorNode || !el.contains(selection.anchorNode)) return;
    setState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      insertOrderedList: document.queryCommandState("insertOrderedList"),
      block: String(document.queryCommandValue("formatBlock") || "").toLowerCase(),
      canUndo: document.queryCommandEnabled("undo"),
      canRedo: document.queryCommandEnabled("redo"),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshState);
    return () => document.removeEventListener("selectionchange", refreshState);
  }, [refreshState]);

  function emit() {
    const el = editorRef.current;
    if (!el) return;
    const characters = countCharacters(el);
    setCount(characters);
    onChange(el.textContent?.trim() ? el.innerHTML : "", characters);
    refreshState();
  }

  function focusEditor() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("defaultParagraphSeparator", false, "p");
  }

  function run(command: Command | "undo" | "redo") {
    focusEditor();
    document.execCommand(command, false);
    emit();
  }

  function toggleBlock(tag: "h2" | "h3") {
    focusEditor();
    document.execCommand("formatBlock", false, state.block === tag ? "<p>" : `<${tag}>`);
    emit();
  }

  function openLink() {
    const selection = document.getSelection();
    const el = editorRef.current;
    savedRange.current = selection && selection.rangeCount && el?.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    setLinkValue("");
    setLinkError(null);
    setLinkOpen(true);
    requestAnimationFrame(() => document.getElementById(linkInputId)?.focus());
  }

  function applyLink() {
    const href = safeLink(linkValue);
    if (!href) {
      setLinkError("Enter an https:// address or a mailto: link.");
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const selection = document.getSelection();
    if (savedRange.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    if (!selection || selection.isCollapsed) {
      const text = escapeHtml(href.replace(/^mailto:/i, ""));
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(href)}">${text}</a>`);
    } else {
      document.execCommand("createLink", false, href);
    }
    setLinkOpen(false);
    emit();
  }

  const remaining = maxChars - count;
  const isEmpty = count === 0;

  return (
    <div className={cn("rounded-[10px] border bg-surface", invalid || remaining < 0 ? "border-danger" : "border-line", disabled && "bg-canvas")}>
      <div role="toolbar" aria-label="Formatting" aria-controls={id} className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        <ToolButton label="Heading" pressed={state.block === "h2"} disabled={disabled} onClick={() => toggleBlock("h2")}>
          <Heading2 className="size-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Subheading" pressed={state.block === "h3"} disabled={disabled} onClick={() => toggleBlock("h3")}>
          <Heading3 className="size-4" aria-hidden="true" />
        </ToolButton>
        <Divider />
        <ToolButton label="Bold" pressed={state.bold} disabled={disabled} onClick={() => run("bold")}>
          <Bold className="size-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Italic" pressed={state.italic} disabled={disabled} onClick={() => run("italic")}>
          <Italic className="size-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Underline" pressed={state.underline} disabled={disabled} onClick={() => run("underline")}>
          <Underline className="size-4" aria-hidden="true" />
        </ToolButton>
        <Divider />
        <ToolButton label="Bulleted list" pressed={state.insertUnorderedList} disabled={disabled} onClick={() => run("insertUnorderedList")}>
          <List className="size-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Numbered list" pressed={state.insertOrderedList} disabled={disabled} onClick={() => run("insertOrderedList")}>
          <ListOrdered className="size-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Link" disabled={disabled} onClick={openLink} expanded={linkOpen}>
          <Link2 className="size-4" aria-hidden="true" />
        </ToolButton>
        <Divider />
        <ToolButton label="Undo" disabled={disabled || !state.canUndo} onClick={() => run("undo")}>
          <Undo2 className="size-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Redo" disabled={disabled || !state.canRedo} onClick={() => run("redo")}>
          <Redo2 className="size-4" aria-hidden="true" />
        </ToolButton>
      </div>

      {linkOpen ? (
        <div className="flex flex-wrap items-start gap-2 border-b border-line px-3 py-2">
          <label htmlFor={linkInputId} className="sr-only">
            Link address
          </label>
          <div className="min-w-0 flex-1">
            <input
              id={linkInputId}
              type="url"
              value={linkValue}
              placeholder="https://www.example.com"
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setLinkOpen(false);
                  editorRef.current?.focus();
                }
              }}
              aria-invalid={linkError ? true : undefined}
              aria-describedby={linkError ? `${linkInputId}-error` : undefined}
              className="h-8 w-full rounded-[8px] border border-line px-2.5 text-sm focus:border-ink-2 focus:outline-none"
            />
            {linkError ? (
              <p id={`${linkInputId}-error`} className="mt-1 text-[13px] text-danger">
                {linkError}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={applyLink} className="h-8 rounded-[8px] bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2">
            Add link
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkOpen(false);
              editorRef.current?.focus();
            }}
            className="h-8 rounded-[8px] px-3 text-[13px] text-ink-2 hover:bg-hover"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="relative">
        {isEmpty ? (
          <p aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 text-sm text-subtle">
            {placeholder}
          </p>
        ) : null}
        <div
          ref={editorRef}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          aria-describedby={[describedById, counterId].filter(Boolean).join(" ")}
          aria-invalid={invalid || remaining < 0 ? true : undefined}
          aria-readonly={disabled || undefined}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          onDrop={(event) => event.preventDefault()}
          className={cn("min-h-40 px-3.5 py-3 text-sm text-ink focus:outline-none", richTextContentClass)}
        />
      </div>
      <p id={counterId} className={cn("border-t border-line px-3.5 py-1.5 text-xs", remaining < 0 ? "text-danger" : "text-muted")} aria-live="polite">
        {maxChars.toLocaleString("en-US")} character limit -{" "}
        {remaining >= 0 ? `${remaining.toLocaleString("en-US")} characters left` : `${Math.abs(remaining).toLocaleString("en-US")} characters over`}
      </p>
    </div>
  );
}

function ToolButton({ label, pressed, expanded, disabled, onClick, children }: { label: string; pressed?: boolean; expanded?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-expanded={expanded === undefined ? undefined : expanded}
      disabled={disabled}
      // Keep the editor's selection when clicking a tool.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-[6px] text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40 max-md:size-11",
        pressed && "bg-selected text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />;
}
