import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/session";
import { listUserOrganizations } from "@/server/authz";
import { getDb } from "@/server/db/client";
import { userFlags } from "@/server/db/schema";

/** `/home`: open the last-used workspace, or start onboarding when the user has none. */
export default async function HomeRedirect() {
  const { user } = await requireUser("/home");
  const orgs = await listUserOrganizations(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const db = await getDb();
  const [flags] = await db.select().from(userFlags).where(eq(userFlags.userId, user.id)).limit(1);
  const target = orgs.find((o) => o.org.id === flags?.lastOrgId) ?? orgs[0];
  redirect(`/home/${target.org.slug}`);
}
