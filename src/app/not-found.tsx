import Link from "next/link";

/** Same response for "does not exist" and "not yours" — no tenant information leaks. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="text-2xl font-semibold text-ink">We couldn’t find that page</h1>
      <p className="max-w-md text-sm text-muted">It may not exist, or you may not have access to it with this account.</p>
      <Link href="/home" className="mt-2 text-sm font-medium text-ink underline underline-offset-4">
        Go to your workspace
      </Link>
    </main>
  );
}
