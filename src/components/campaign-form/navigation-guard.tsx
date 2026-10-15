"use client";

import Link from "next/link";
import { createContext, useContext, type ComponentProps } from "react";

/**
 * Lets links inside the form ask before leaving with unsaved changes. The
 * form provides the guard; outside a form the links behave normally.
 */
export type NavigationGuard = (event: { preventDefault: () => void }, href: string) => void;

export const NavigationGuardContext = createContext<NavigationGuard | null>(null);

export function GuardedLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & { href: string }) {
  const guard = useContext(NavigationGuardContext);
  return <Link href={href} onNavigate={guard ? (event) => guard(event, href) : undefined} {...rest} />;
}
