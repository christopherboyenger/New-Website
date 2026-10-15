import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { devToolsEnabled } from "@/server/env";
import { getDb } from "@/server/db/client";
import { emailOutbox } from "@/server/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Development email outbox", robots: { index: false } };

/**
 * DEVELOPMENT ONLY. Shows emails recorded while no email provider is
 * configured, so verification/invitation links can be followed locally.
 * Returns 404 in production unless ENABLE_DEV_TOOLS=true (never set that in production).
 */
export default async function DevOutboxPage() {
  if (!devToolsEnabled()) notFound();
  const db = await getDb();
  const rows = await db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(50);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Development email outbox</h1>
      <p className="mt-1 text-sm text-muted">Development tool. Messages below were not delivered unless their status says “sent”.</p>
      <ul className="mt-6 flex flex-col gap-4">
        {rows.length === 0 ? <li className="text-sm text-muted">No messages yet.</li> : null}
        {rows.map((m) => (
          <li key={m.id} className="rounded-[12px] border border-line p-4">
            <p className="text-sm">
              <span className="font-medium">{m.subject}</span> → {m.toEmail}
            </p>
            <p className="text-xs text-muted">
              {m.createdAt.toISOString()} · {m.status}
            </p>
            <pre className="mt-3 whitespace-pre-wrap break-all rounded-md bg-canvas p-3 text-xs">{m.body}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}
