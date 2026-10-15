/**
 * In-memory stand-in for Next.js request APIs (`cookies()`, `headers()`) so
 * Server Actions and auth code can be unit-tested. Installed globally by
 * tests/support/setup.ts; call `resetRequestContext()` in beforeEach and
 * `signInAs(userId)` to act as a user.
 */
import { createSession } from "@/server/auth/session";

export const cookieJar = new Map<string, string>();
export const headerBag = new Map<string, string>([["user-agent", "vitest"]]);

export function resetRequestContext(): void {
  cookieJar.clear();
  headerBag.clear();
  headerBag.set("user-agent", "vitest");
}

export function cookiesApi() {
  return {
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    has: (name: string) => cookieJar.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === "string") cookieJar.set(name, value ?? "");
      else cookieJar.set(name.name, name.value);
    },
    delete: (name: string) => cookieJar.delete(name),
  };
}

export function headersApi() {
  return new Headers([...headerBag]);
}

/** Starts a real session for `userId` (rows in the test DB + cookie in the jar). */
export async function signInAs(userId: string): Promise<void> {
  cookieJar.clear();
  await createSession(userId);
}
