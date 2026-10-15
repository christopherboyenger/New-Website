import type { ReactNode } from "react";
import { listUserOrganizations } from "@/server/authz";
import { loadCreatorContext } from "@/server/creator/context";
import { CreatorShell } from "@/components/creator/creator-shell";

/**
 * Creator portal shell. Each page enforces sign-in and a creator profile
 * itself (with its own return path); the shell only reads what it can show.
 */
export default async function CreatorPortalLayout({ children }: { children: ReactNode }) {
  const ctx = await loadCreatorContext();
  const brandWorkspaces = ctx ? await listUserOrganizations(ctx.user.id) : [];
  return (
    <CreatorShell displayName={ctx?.creator.displayName ?? null} hasBrandWorkspace={brandWorkspaces.length > 0}>
      {children}
    </CreatorShell>
  );
}
