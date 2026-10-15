"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Menu button (WAI-ARIA menu pattern): the trigger exposes aria-haspopup and
 * aria-expanded; arrow keys, Home and End move between items; Escape closes
 * and returns focus to the trigger; clicking outside or tabbing away closes.
 * Items are rendered by the caller with role="menuitem" / "menuitemradio".
 */
export type MenuPlacement = "below" | "above" | "right-top" | "right-bottom";

const placements: Record<MenuPlacement, string> = {
  below: "left-0 top-full mt-1 w-full",
  above: "bottom-full left-0 mb-1 w-full",
  "right-top": "left-full top-0 ml-2",
  "right-bottom": "bottom-0 left-full ml-2",
};

export interface MenuProps {
  /** Accessible name of the trigger. */
  buttonLabel: string;
  buttonContent: ReactNode;
  buttonClassName?: string;
  menuLabel: string;
  placement: MenuPlacement;
  menuClassName?: string;
  children: ReactNode;
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')) : [];
}

export function Menu({ buttonLabel, buttonContent, buttonClassName, menuLabel, placement, menuClassName, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    (items.find((el) => el.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function closeAndRefocus() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems(menuRef.current);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeAndRefocus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={buttonLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonClassName}
      >
        {buttonContent}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => {
            // Links navigate and close the menu; buttons (e.g. a form submit) keep it mounted until they finish.
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className={cn("absolute z-40 min-w-[232px] rounded-[10px] border border-line bg-surface p-1 text-sm text-ink-2 shadow-lg", placements[placement], menuClassName)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export const menuItemClass =
  "flex min-h-8 w-full items-center gap-2 rounded-[8px] px-2 py-1 text-left text-ink-2 outline-offset-[-2px] hover:bg-hover hover:text-ink focus:bg-hover focus:text-ink";

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
