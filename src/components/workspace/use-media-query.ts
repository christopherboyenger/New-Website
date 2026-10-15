"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The sidebar becomes a drawer and the messages panel goes full-width below this width. */
export const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Subscribes to a CSS media query. `serverValue` is used for the server render
 * and hydration; the live value takes over right after hydration.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function isDesktopViewport(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

const noSubscription = () => () => {};

/** Apple platforms show ⌘K; everything else shows Ctrl K. The server renders ⌘K. */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => true,
  );
}
