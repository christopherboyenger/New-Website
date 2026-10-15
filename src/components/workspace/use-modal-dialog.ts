"use client";

import { useEffect, useRef, type MouseEvent } from "react";

/**
 * Drives a native <dialog> as a modal from React state: showModal() makes the
 * rest of the page inert (focus is contained), Escape closes it, and focus
 * returns to the element that was focused when it opened. `onClose` runs for
 * every close (Escape, backdrop click, or `open` turning false).
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      returnFocus.current = null;
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  /** Close when the backdrop (the dialog element itself, outside its content) is clicked. */
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === ref.current) ref.current?.close();
  };

  return { ref, onBackdropClick };
}
