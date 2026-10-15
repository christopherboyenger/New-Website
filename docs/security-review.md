# Security and tenant-isolation review

- **Date:** 2026-10-15
- **Scope:** every `"use server"` module (20 files), every Route Handler under `src/app/api/**` (7), and every page under `/home/[org]`, `/creator`, `/ops`, `/invitations`, `/dev`. Checked: authentication, authorization against the DEC-005 role matrix, tenant qualification of every query, whether non-members and nonexistent resources look the same, IDOR on entity IDs, open redirects, secret handling, webhook verification, OAuth state, rate limits, XSS and CSRF.
- **Regression suite:** `tests/unit/tenant-isolation.test.ts`. As the owner of workspace A, it calls representative actions from every area against workspace B: B's slug, and A's slug with B's campaign/playbook/post/creator/teammate/invitation/API-token/conversation IDs. Each call must return `not_found`, B's rows must be unchanged, and A's reads (search, ads, messages, Reporting API) must return no B data. The suite also covers the operator console and the Member role.
- **Manual checks (isolated dev server):**
  - Another workspace's page and a nonexistent slug both return 404, including `/billing`.
  - A cross-site POST to `/api/integrations/meta_ads/start` returns 403. The same POST naming another org returns 404.
  - A forged OAuth `state` sends the browser to `/home`.
  - `/api/v1/*` without a token returns 401.
  - The Stripe webhook without a secret returns 503.
  - `/ops` returns 404 for non-operators.
  - `?next=//evil.example` is not honored.

## Findings

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| SEC-01 | Medium | **One-time credentials stored in plaintext in `email_outbox`.** Auth tokens and invitation tokens are stored only as keyed digests. But `sendEmail` also stored the full message body in `email_outbox`, and that body contains the usable verification, password-reset and invitation links. In production, anyone who could read that table could reset passwords or accept invitations. | **Fixed.** `src/server/email.ts`: production (without `ENABLE_DEV_TOOLS`) now stores a copy with the one-time links redacted (`redactOneTimeLinks`). Dev and test keep the full body for `/dev/outbox`. Test: `src/server/email.test.ts`. |
| SEC-02 | Low | **Email tokens could be used twice by concurrent requests.** `verifyEmailToken` and `resetPassword` selected the token row and then marked it consumed without re-checking `consumed_at`. Two concurrent submissions of the same reset link could both set a password (reproduced with `Promise.all`). Older reset links also stayed valid after a successful reset. | **Fixed.** `src/server/auth/service.ts`: the token is claimed with a conditional `UPDATE … WHERE consumed_at IS NULL RETURNING`. A successful reset also consumes every other outstanding reset link for that user. Tests: `src/server/auth/auth.test.ts`. |
| SEC-03 | Low | **Creators could see a brand's unpublished playbook name.** `listSubmissions` (creator portal, Submissions page) read `playbooks.name`, which is the brand's live working draft, so draft renames leaked to creators. This also contradicted the portal's own rule that names come from the published revision (see `loadCreatorCampaign`). | **Fixed.** `src/server/creator/fulfillment.ts` now joins `playbook_revisions` on the revision the post was made from. Test: `src/server/creator/fulfillment.test.ts`. |
| SEC-04 | Info | **Branding live preview renders the editor's current HTML unsanitized.** `brand-preview.tsx` uses `dangerouslySetInnerHTML` on the user's own unsaved editor markup. The stored copy is always sanitized server-side (`sanitizeRichText`), and every other render uses sanitized output. The preview only shows the author's own in-browser content, and browsers strip script and handlers when pasting into `contenteditable`, so at most this is self-XSS. | **Accepted.** Sanitizing on the client would add `sanitize-html` to the client bundle. Revisit if the preview ever renders someone else's draft. |
| SEC-05 | Low | **Weak abuse limits on sign-up and leads.** Sign-up is rate-limited per email address (5/h) but not per client, which allows bulk account creation. Lead rate limits key on the first `X-Forwarded-For` value, which is only trustworthy behind a proxy that overwrites it (as Vercel does). | **Accepted / reported.** Needs a deployment decision on the trusted client-IP source; then add a per-IP sign-up limit. |
| SEC-06 | Low | **Sign-up reveals whether an account exists.** It answers "An account with this email already exists". Sign-in and password reset are neutral. | **Accepted.** Standard UX trade-off, limited by the per-email rate limit. |
| SEC-07 | Info (fraud) | **Post URLs are not checked against the submitting account's handle.** A creator can submit another account's post URL from their own unverified account, which also blocks the real owner from submitting it (uniqueness is per platform + URL). The operator review card already fails "Social account verified" for unverified accounts, and nothing is approved automatically. | **Reported.** Account verification is not implemented yet. A URL-handle consistency check belongs to creator-portal and ops review, not to tenant isolation. |

## Verified as correct (no change)

- **Authorization:**
  - Every Server Action re-authorizes from the slug with `requireOrgAction(slug, permission)`, or uses `requireCreatorAction` / `requireOperatorAction`.
  - Onboarding resolves the workspace from the user's own draft, never from client input.
  - Permissions match DEC-005: owner-only campaign, billing, integrations, tokens, members and branding; members get read access, playbook drafts and messages.
  - The `"use server"` modules export only actions and types, with no internal `orgId`-taking helpers.
- **Tenant qualification:** every entity lookup includes the authorized `orgId`. This covers `getCampaign`, `getPlaybook`, posts, ad submissions, invitations, API grants, conversations, roster checks, breakdown IDs and join requests. Non-member, nonexistent and foreign IDs all raise `NotFoundError`, and pages use `requireOrgPage`, which calls `notFound()`.
- **Reporting API:** the org comes only from the bearer token's grant. Tokens are stored as digests (`rk_` prefix). A token stops working when it is revoked or expires, or when its creator loses `api_tokens:manage`. The API is rate-limited per grant and checks scopes.
- **OAuth:**
  - `state` is stored as a digest and bound to the user, session, org and provider, with a 10-minute expiry. It is claimed atomically and only once.
  - On callback, membership and permission are re-checked twice.
  - The return path is allowlisted to `/home/<slug>/integrations`.
  - The start endpoint is POST-only, checks Origin / `Sec-Fetch-Site`, and requires recent authentication and a verified email.
- **Stripe webhook:** the signature is verified over the raw body, and the event mode must match the key mode. The tenant comes only from the stored customer mapping, unknown customers are quarantined, and inbox de-duplication makes processing idempotent.
- **Credentials:**
  - Credentials are sealed with AES-256-GCM, with additional authenticated data binding org, installation, provider and generation, and are destroyed on disconnect or failed verification.
  - `.p8` keys are never returned. Logs record error names or categories only.
  - Sensitive commands require a verified email and a password confirmed within the last 30 minutes.
- **Redirects:** `isSafeReturnPath` blocks `//`, `/\` and absolute URLs. Stripe success/cancel URLs and email links are built from `NEXT_PUBLIC_APP_URL`, never from the `Host` header. The `/start` return path uses the referer's pathname only, and only when it is same-host.
- **XSS:**
  - The only `dangerouslySetInnerHTML` is SEC-04.
  - Stored rich text is sanitized against an allowlist: links must be `https:` or `mailto:` and get `rel="noopener noreferrer"`.
  - User URLs rendered as links are validated as https: post URLs per platform host, playbook references, brand links and ad destination URLs. The ops review card re-checks them with `safeHttpUrl`.
- **CSRF:**
  - Mutating Route Handlers are the OAuth start (Origin check plus SameSite=Lax) and the Stripe webhook (signature).
  - The OAuth callback is protected by the session-bound one-time state.
  - Server Actions rely on Next's built-in Origin check.
  - The session cookie is `HttpOnly`, `SameSite=Lax` and `__Host-` over HTTPS.
- **Rate limits:**
  - Sign-in: 10 per 15 minutes per email.
  - Password reset: 5 per hour per email.
  - Verification resend: 3 per hour per user.
  - Re-authentication: 10 per 15 minutes per user.
  - Invitations: limited per user and per org.
  - Messages: limited per user per minute.
  - App Store Connect validation: 10 per hour per org.
  - Reporting API: limited per grant.
- **Other surfaces:**
  - The operator console is limited to verified emails listed in `OPERATOR_EMAILS` and returns 404 to everyone else.
  - `/dev/outbox` returns 404 outside development unless `ENABLE_DEV_TOOLS=true`.
  - The invitation and creator portals resolve the invitee or creator from the session; invitations require a matching, verified email.
