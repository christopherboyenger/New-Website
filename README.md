# Creator platform

Brand-side creator-marketing platform: public site, acquisition funnel (`/start`), brand onboarding, workspace (campaigns, playbooks, creators, reporting, ads), integrations, billing, a creator portal and an operator console. Specifications live in `docs/spec/`.

- Product decisions: [docs/decisions.md](docs/decisions.md) (cross-cutting) and `docs/decisions/<area>.md`
- Production readiness, provider setup and feature status: [docs/readiness.md](docs/readiness.md)
- Public Reporting API: [docs/api.md](docs/api.md)
- Engineering conventions: [CLAUDE.md](CLAUDE.md)

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Drizzle ORM on Postgres (embedded PGlite locally), zod, Vitest.

## Run locally

```bash
npm install
npm run dev          # syncs the embedded dev database (.data/pglite), then starts Next.js on http://localhost:3000
```

You don't need any provider credentials to run the app locally. Data is stored in an embedded Postgres (PGlite) under `.data/pglite`, and emails are recorded but not delivered (read them at `/dev/outbox` in development). Each provider-backed feature shows a "not configured" state until its credentials are set (see [docs/readiness.md](docs/readiness.md)).

### Development account and fixtures

Sign up through `/auth/sign-up` and onboarding, or create a verified account and an empty workspace directly. Stop any dev server that uses the same database first:

```bash
npx tsx --conditions=react-server scripts/dev-account.mts --email you@example.test --password "a long local password" --brand "Local Brand" [--plan unlimited]
# also: --role member --org <slug> adds the user to an existing workspace as a Member
```

It prints the workspace slug and a session cookie you can use for scripted checks.

To see populated layouts, add clearly labelled fixture records ("Fixture …") to one workspace. Keep a second workspace empty so you can also check the empty states:

```bash
npx tsx --conditions=react-server scripts/dev-fixtures.mts --org <slug>
```

Both scripts refuse to run when `DATABASE_URL` is set or `NODE_ENV=production`. Fixtures never belong in a real database.

To run more than one dev server at a time, give each its own database and build folder, for example `PGLITE_DIR=.data/pglite-mine NEXT_DIST_DIR=.next-mine npx next dev -p 3100` (run `PGLITE_DIR=.data/pglite-mine npm run db:push` first). `tsconfig.json` excludes `.next-*` folders.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Syncs the local database schema (`db:push`), then starts the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit and integration tests (Vitest, in-memory PGlite per test) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end journeys (see below) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Syncs the schema to the local dev database (no migration files) |
| `npm run db:generate` | Generates SQL migrations into `./drizzle` from `src/server/db/schema` |
| `npm run db:migrate` | Applies `./drizzle` migrations to `DATABASE_URL` |

## End-to-end tests

`npm run test:e2e` runs the Playwright journeys in `tests/e2e/` (config: `playwright.config.ts`, Chromium only, one worker). Playwright starts its own `next dev` on port 3124 (override with `E2E_PORT`) with a throwaway database that is deleted and recreated on every run (`PGLITE_DIR=.data/pglite-e2e`) and its own build folder (`NEXT_DIST_DIR=.next-e2e`), so your development data is never touched. Stop anything else listening on that port first.

| Journey | File |
| --- | --- |
| Brand sign-up → every onboarding screen → "I'll finish later" → playbook editor (edit, save draft, reload) → Organic › Campaigns shows the campaign Inactive | `brand-onboarding.spec.ts` |
| New campaign form: field errors tied to their inputs, invalid hashtag, then a created campaign that starts Inactive | `campaign-create.spec.ts` |
| Creator signs up and links an account; sees nothing until the brand publishes a playbook (blocked without a payment method, asserted) and activates the campaign | `creator-portal.spec.ts` |
| Members: invite → "not emailed" result with a one-time link → copy link → the invitee signs up, verifies via `/dev/outbox`, joins as a Member and cannot see Billing | `members-invitation.spec.ts` |
| Integrations: create an API token through the password step-up → `GET /api/v1/campaigns` returns only that workspace; a wrong or missing token gets 401, a missing scope 403 | `reporting-api.spec.ts` |

The journeys assume a deployment without provider credentials (email, Stripe), so the server is started without `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`; don't put those in a `.env*` file when running the suite. Each test creates its own users and workspaces, so tests can run alone (`npx playwright test creator-portal`) or repeatedly (`--repeat-each`).

**Test-only hook.** Publishing needs a payment method confirmed by the payment provider, which this environment cannot produce. The creator journey therefore calls `POST /api/e2e/payment-method` (`src/app/api/e2e/payment-method/route.e2e.ts` → `tests/e2e/support/payment-method-hook.ts`), which records the signed-in owner's workspace card as confirmed. It is a route only when the dev server runs with `E2E_TEST_HOOKS=1` (`pageExtensions` in `next.config.ts`); every other build ignores the file, and the hook also refuses production, `DATABASE_URL` and non-owners.

Chromium is taken from `/opt/pw-browsers/chromium`; set `E2E_CHROMIUM_PATH` to use another binary. While writing tests you can start the server yourself with the same environment and pass `E2E_REUSE_SERVER=1`. Failure traces and screenshots go to `test-results/` (`npx playwright show-trace <trace.zip>`).

## Environment variables

All of them are optional in development. Each one is validated in `src/server/env.ts` (server) or `src/config/site.ts` (public).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. **Required in production.** Without it, development uses PGlite. |
| `PGLITE_DIR` | Location of the embedded dev database (default `.data/pglite`). |
| `AUTH_SECRET` | At least 32 characters, used to key token digests (sessions, API tokens, invitations). **Required in production.** |
| `CREDENTIALS_ENCRYPTION_KEY` | 32-byte base64 key for sealing tenant provider credentials (AES-256-GCM). Without it, provider secrets are refused. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email delivery. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_UNLIMITED_PRICE_ID` | Card setup, plan upgrade and payment webhooks (`/api/webhooks/stripe`). |
| `META_APP_ID`, `META_APP_SECRET` | This product's Meta app (OAuth callback `/api/integrations/meta_ads/callback`). |
| `TIKTOK_BUSINESS_APP_ID`, `TIKTOK_BUSINESS_APP_SECRET` | This product's TikTok for Business app (OAuth callback `/api/integrations/tiktok_ads/callback`). |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` | The service account that customers invite in Play Console. |
| `OPERATOR_EMAILS` | Comma-separated emails allowed into the operator console (`/ops`). |
| `ENABLE_DEV_TOOLS` | Enables development tools (such as `/dev/outbox`) outside development. Never set it in production. |
| `NEXT_PUBLIC_APP_URL` | Public origin, used for absolute links and OAuth redirect URIs (default `http://localhost:3000`). |
| `NEXT_PUBLIC_PRODUCT_NAME`, `NEXT_PUBLIC_PRODUCT_WORDMARK` | Product name and wordmark. The defaults are placeholders (DEC-001). |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Where lead notifications go. Without it, none are sent. |
| `NEXT_PUBLIC_SALES_BOOKING_URL` | Sales call booking link. Without it, sales CTAs only save the lead and say so. |
| `NEXT_PUBLIC_DOCS_URL` | External documentation link. |

For what each provider also needs beyond its variables (app review, customer authorization, webhook registration), and for what is not implemented yet, see [docs/readiness.md](docs/readiness.md).

## Deploying

1. Set `DATABASE_URL` and `AUTH_SECRET`, plus the provider variables you need.
2. Generate migrations once from the schema (`npm run db:generate`), commit them, and apply them with `npm run db:migrate`.
3. `npm run build && npm start`.
4. Register the Stripe webhook endpoint and the OAuth redirect URIs listed in [docs/readiness.md](docs/readiness.md).
