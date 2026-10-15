/**
 * DEVELOPMENT ONLY — creates a verified user and an EMPTY brand workspace in
 * the local embedded database, so a dev server can be signed into without
 * going through onboarding. Creates no campaigns, posts or metrics.
 *
 *   npx tsx --conditions=react-server scripts/dev-account.mts --email you@example.test --password "long password" --brand "Local Brand" [--plan unlimited] [--role member --org <slug>]
 *
 * Stop any dev server using the same PGLITE_DIR first.
 */
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";

if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("Refusing to run: this script only targets the local development database.");
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    first: { type: "string", default: "Dev" },
    last: { type: "string", default: "User" },
    brand: { type: "string" },
    plan: { type: "string", default: "basic" },
    role: { type: "string", default: "owner" },
    org: { type: "string" },
  },
});
if (!values.email || !values.password) {
  console.error("--email and --password are required");
  process.exit(1);
}

const { getDb } = await import("../src/server/db/client.ts");
const { users, organizations, memberships } = await import("../src/server/db/schema/index.ts");
const { hashPassword } = await import("../src/server/auth/password.ts");
const { createOrganization } = await import("../src/server/organizations.ts");
const { newId } = await import("../src/lib/ids.ts");
const { generateToken, tokenDigest } = await import("../src/server/crypto.ts");
const { sessions } = await import("../src/server/db/schema/index.ts");

const db = await getDb();
const email = values.email.trim().toLowerCase();
let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
if (!user) {
  [user] = await db
    .insert(users)
    .values({ id: newId("usr"), email, passwordHash: await hashPassword(values.password), firstName: values.first!, lastName: values.last!, emailVerifiedAt: new Date() })
    .returning();
  console.log(`Created user ${email}`);
} else {
  console.log(`User ${email} already exists`);
}

if (values.org) {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, values.org)).limit(1);
  if (!org) throw new Error(`No workspace with slug ${values.org}`);
  await db.insert(memberships).values({ orgId: org.id, userId: user.id, role: values.role === "member" ? "member" : "owner" }).onConflictDoNothing();
  console.log(`Added ${email} to /home/${org.slug} as ${values.role}`);
} else if (values.brand) {
  const org = await createOrganization(user.id, { name: values.brand, website: "", description: "" });
  if (values.plan === "unlimited") await db.update(organizations).set({ planId: "unlimited" }).where(eq(organizations.id, org.id));
  console.log(`Created empty workspace /home/${org.slug} (plan: ${values.plan})`);
}
// A 30-day session for scripted browsers (Playwright `context.addCookies`) and curl.
const token = generateToken();
await db.insert(sessions).values({ id: newId("ses"), tokenDigest: tokenDigest(token, "session"), userId: user.id, expiresAt: new Date(Date.now() + 30 * 86_400_000) });
console.log(`Session cookie: session=${token}`);
process.exit(0);
