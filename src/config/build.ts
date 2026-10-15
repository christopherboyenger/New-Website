/** Short build identifier shown in the sidebar footer (commit SHA when deployed on Vercel). */
export function buildVersion(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_SHA ?? null;
  return sha ? sha.slice(0, 7) : null;
}
