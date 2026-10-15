"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { organicHref, type OrganicState } from "@/domain/organic-url-state";

/**
 * Client navigation for Organic controls: every change is a URL change
 * (push, so Back/Forward step through it), built by the shared codec.
 * `pending` lets controls dim while the server renders the new state.
 */
export function useOrganicNav(basePath: string, state: OrganicState) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (patch: Partial<OrganicState>, opts: { replace?: boolean } = {}) => {
      const href = organicHref(basePath, state, patch);
      startTransition(() => {
        if (opts.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [basePath, router, state],
  );
  return { navigate, pending, href: (patch: Partial<OrganicState>) => organicHref(basePath, state, patch) };
}
