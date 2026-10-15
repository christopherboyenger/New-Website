# Production readiness

What each external capability needs before it works for real customers, and how far each feature has actually got. The server-side source of truth is `src/server/readiness.ts` (`capabilities()`); it reports only what the server can tell on its own: whether credentials or resources are present. It never claims that a provider review, a customer grant or an end-to-end test passed. Screens that depend on a capability show a "not configured" state (`NotConfiguredNotice`) until it is set up. They never show a fake success.

Readiness stages (production-requirements.md §5):

1. **Implemented**: code exists in this repository and is covered by tests.
2. **Provisioned**: the deployment has the credentials or resources (env vars, provider app, storage).
3. **Authorized**: provider app review or approval is granted, and the customer has authorized their account where that applies.
4. **Verified**: a real end-to-end run has succeeded against the live provider on this deployment.
5. **Live**: the feature is turned on for customers.

None of the provider-backed features below has been provisioned, authorized or verified from this repository. Those stages happen per deployment and have to be checked by whoever operates it.

## Capabilities (`src/server/readiness.ts`)

| Key | Label | Configured when | Also needs | Without it |
| --- | --- | --- | --- | --- |
| `database` | Database | `DATABASE_URL` is set | Apply migrations (`npm run db:generate` once at integration, then `npm run db:migrate`) | Development and tests use embedded PGlite (`.data/pglite`, or `PGLITE_DIR`). In production a missing `DATABASE_URL` is reported as not set. |
| `email` | Transactional email | `RESEND_API_KEY` **and** `EMAIL_FROM` | A verified sending domain at the email provider | Messages are written to the outbox with status `provider_unconfigured`, and the UI says they were not delivered. `/dev/outbox` shows them in development. |
| `payments` | Card payments | `STRIPE_SECRET_KEY` | `STRIPE_UNLIMITED_PRICE_ID` for plan upgrades; a Stripe account with Checkout (setup mode) enabled | Cards can't be added. Billing and onboarding show "not configured". |
| `payment_webhooks` | Payment webhooks | `STRIPE_WEBHOOK_SECRET` | A webhook endpoint registered in Stripe (see below) | Payment results can't be confirmed by webhook. Onboarding and billing can still reconcile on return by asking Stripe directly when `STRIPE_SECRET_KEY` is set. |
| `credential_custody` | Credential encryption | `CREDENTIALS_ENCRYPTION_KEY` (32-byte base64, AES-256-GCM, DEC-016) | Key rotation procedure (not implemented) | Provider secrets (for example App Store Connect keys) are refused. |
| `meta_ads` | Meta Ads app | `META_APP_ID` **and** `META_APP_SECRET` | This product's own Meta app with the OAuth redirect URI below; Meta app review for `ads_read` (reporting) and `ads_management` (launch drafts); customer authorization | The Meta card in Integrations shows "not configured". |
| `tiktok_ads` | TikTok Ads app | `TIKTOK_BUSINESS_APP_ID` **and** `TIKTOK_BUSINESS_APP_SECRET` | This product's own TikTok for Business app with the redirect URI below and approved permissions; advertiser authorization | The TikTok card shows "not configured". |
| `google_play` | Google Play reporting identity | `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` | This product's Google Cloud service account; each customer must invite it in Play Console and give the package name and the reports bucket ID | No service account is shown. Installations stay `verifying` ("Awaiting verification"). |
| `app_store_connect` | App Store Connect | `credential_custody` is configured | The customer's App Store Connect API key (Sales and Reports, read-only) | Keys can't be accepted. With the key in place, an installation becomes `connected` only after a real API read succeeds. |
| `media_storage` | Media storage | never (hard-coded `false`) | Object storage, upload signing and scanning: **not implemented** | Uploads are disabled. Playbooks can reference external links only (ids prefixed `ref_`). |
| `forecasting` | Reach forecasting | never | A forecasting model or service: **not implemented** (`src/server/forecast.ts` always returns "unavailable", DEC-008) | Estimates show "Reach estimate unavailable". |
| `ai_authoring` | AI authoring | never | Model access: **not implemented** | The playbook editor reports AI assistance as unavailable. |
| `mcp` | MCP server | never | An MCP server and its OAuth authorization server: **not implemented** in this build | The Integrations → API page shows "The MCP server isn't deployed yet" and hands out no URL or code. |
| `creator_payouts` | Creator payouts | never | A payout platform (for example Stripe Connect), KYC and tax forms: **not implemented** | Creator earnings show as not payable. |

Other environment variables (`src/server/env.ts`, `src/config/site.ts`): `AUTH_SECRET` (at least 32 characters, required in production), `OPERATOR_EMAILS` (operator console access), `ENABLE_DEV_TOOLS` (never in production), `NEXT_PUBLIC_APP_URL` (public origin, used for OAuth callbacks and absolute links), `NEXT_PUBLIC_PRODUCT_NAME` / `NEXT_PUBLIC_PRODUCT_WORDMARK`, `NEXT_PUBLIC_SUPPORT_EMAIL` (lead notifications), `NEXT_PUBLIC_SALES_BOOKING_URL`, `NEXT_PUBLIC_DOCS_URL`.

## Provider endpoints

### Stripe webhook: `POST /api/webhooks/stripe`

Register `${NEXT_PUBLIC_APP_URL}/api/webhooks/stripe` in Stripe and set its signing secret as `STRIPE_WEBHOOK_SECRET`. Every request's signature is verified against the raw body (missing secret → 503, bad signature → 400, test/live mode mismatch → 400). Events are stored in a webhook inbox de-duplicated by event ID, and processing failures are listed in the operator console (`/ops/webhooks`). Handled events (`handledStripeEvents` in `src/server/billing/webhooks.ts`):

- `checkout.session.completed`, `checkout.session.expired`
- `setup_intent.succeeded`, `setup_intent.setup_failed`, `setup_intent.requires_action`
- `payment_method.detached`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `invoice.paid`, `invoice.payment_failed`

Other event types are acknowledged and ignored.

### OAuth: `/api/integrations/<provider>/start` → `/api/integrations/<provider>/callback`

`<provider>` is `meta_ads` or `tiktok_ads`. Register these redirect URIs in the provider apps:

- `${NEXT_PUBLIC_APP_URL}/api/integrations/meta_ads/callback`
- `${NEXT_PUBLIC_APP_URL}/api/integrations/tiktok_ads/callback`

The state is single-use, expires after 10 minutes and is bound to the user and workspace. The code is exchanged on the server and the grant is verified with a real read before the installation becomes `connected`. Meta reporting asks only for `ads_read`. Building ad launch drafts also needs `ads_management`, and a Meta installation without it is not launch-ready (`src/domain/ad-launch-readiness.ts`).

### Reporting API: `/api/v1/*`

Bearer API tokens created in Integrations → API. See [docs/api.md](./api.md).

## Feature tracker

Columns are the stages above. "Yes" under **Implemented** means the code exists and is tested in this repository. The later stages depend on the deployment, so they read "per deployment" when the code is ready for them and "—" when there is nothing to provision yet.

| Feature | Implemented | Provisioned | Authorized | Verified | Live | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Accounts, sessions, email verification, password reset | Yes | per deployment (`AUTH_SECRET`, email) | n/a | per deployment | per deployment | Email delivery needs the `email` capability. |
| Workspaces, members, invitations, roles | Yes | per deployment | n/a | per deployment | per deployment | Invitation emails need `email`. |
| Campaigns, playbooks (drafts, publish gate), branding, ad settings | Yes | per deployment | n/a | per deployment | per deployment | Publishing, turning a published playbook on, and activating a campaign whose playbook is on all need a provider-confirmed payment method (commercial policy). Editing never publishes. |
| Organic reporting UI and Reporting API | Yes (reads stored metrics) | per deployment | n/a | per deployment | per deployment | Shows "—" / unavailable until metrics exist. |
| **Metric ingestion** (post views/likes, ad metrics, store installs) | **No** | — | — | — | — | No job pulls metrics from TikTok, Instagram, Meta, App Store or Play. Metric tables are filled only by tests and labelled dev fixtures. |
| Payment method setup (Stripe Checkout, setup mode) | Yes | per deployment (`STRIPE_SECRET_KEY`) | Stripe account activation | per deployment | per deployment | Return reconciliation and webhooks both supported. |
| Plan upgrade (Stripe-hosted) | Yes | per deployment (`STRIPE_UNLIMITED_PRICE_ID`) | Stripe account activation | per deployment | per deployment | Prices come only from `src/config/commercial-policy.ts`. |
| Billing threshold setting | Yes (stores the chosen threshold) | n/a | n/a | n/a | n/a | Only the setting is implemented. |
| **Threshold charging** (charging cards as creators earn) | **No** | — | — | — | — | No code creates charges. The validation charge and matching credit are disabled in commercial policy (DEC-007). |
| Stripe webhooks | Yes | per deployment (`STRIPE_WEBHOOK_SECRET` + endpoint) | n/a | per deployment | per deployment | |
| Meta / TikTok connection (OAuth) | Yes | per deployment (app credentials) | Provider app review + customer grant | per deployment | per deployment | |
| App Store Connect connection | Yes | per deployment (`CREDENTIALS_ENCRYPTION_KEY`) | Customer API key | per deployment | per deployment | `connected` only after a real API read. |
| Google Play connection | Partial | per deployment (service account) | Customer invite in Play Console | **No**: no verification run is implemented, so installations stay `verifying` | — | |
| Ad launch drafts | Yes (draft only) | needs a launch-ready Meta/TikTok installation | as above | — | — | Drafts never call a provider, activate or spend. |
| **Ad launch adapter** (create, activate and report ads at Meta/TikTok) | **No** | — | — | — | — | Launches stay in stage `draft`. No ad performance is shown. |
| **Media storage** (uploads) | **No** | — | — | — | — | External links only. |
| Reach forecasting | No (always "unavailable") | — | — | — | — | DEC-008. |
| AI authoring | No | — | — | — | — | |
| **MCP server** | **No** | — | — | — | — | No server or authorization server is deployed. |
| **Creator payouts** | **No** | — | — | — | — | Earnings math exists. Payouts need a payout platform. |
| Operator console (`/ops`) | Yes | per deployment (`OPERATOR_EMAILS`) | n/a | per deployment | per deployment | |
| Marketing site and `/start` lead funnel | Yes | per deployment | n/a | per deployment | per deployment | Lead notification emails need `email` and `NEXT_PUBLIC_SUPPORT_EMAIL`. |
