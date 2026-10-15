@AGENTS.md

# Creator platform — engineering conventions

A brand-side creator-marketing platform (marketing site → acquisition → brand onboarding → workspace → campaigns → playbooks → creator posts → reporting/ads), built from the specifications in `docs/spec/`. Read the spec sections for your area before building; `docs/decisions.md` records product decisions already made.

## Non-negotiables

1. **Separate product, not a clone of the reference.** Never use the reference product's name ("Noise"), wordmark, logo, marketing claims, endpoints (`getnoise.com`, its MCP URL, its service-account email), or its account data (Testingcreators, Annie, Diaz, Test, IDs 20192/24964). Product name/wordmark come from `src/config/site.ts`. Functional UI labels from the spec ("Tell us about your brand", column names, etc.) are fine.
2. **Honest states, never fabricated data.** No demo/sample records in real workspaces, no invented metrics, creators, testimonials, faces or logos. Distinguish: loading · confirmed empty (zero is OK) · unavailable/not connected (show why, never 0) · stale · error. A provider that is not configured shows a "not configured" state (see `src/server/readiness.ts`, `NotConfiguredNotice`), never a fake success. Don't claim an email was sent unless `sendEmail` returned `sent`.
3. **Authorization on the server, every time.** Pages: `requireOrgPage(slug)`; Server Actions/Route Handlers: `requireOrgAction(slug, permission)`. Every query is tenant-qualified with `orgId` from the authorized context — never from client input. Non-member and nonexistent resources look identical (404 / `NotFoundError`). Permissions: `src/domain/permissions.ts`. Plan gates: `src/domain/entitlements.ts` — UI badges are cosmetic; commands must `assertEntitled`.
4. **Money and policy.** Integer cents (`src/lib/money.ts`). Plan names, prices, credits, thresholds and disclosures come only from `src/config/commercial-policy.ts`; respect its `enabled` flags (undecided offers/charges are not shown or performed). Forecasts come only from `src/server/forecast.ts` (currently always "unavailable"). Reporting semantics live in `src/domain/reporting-math.ts` and `src/server/reporting.ts` (UTC days, weighted CPM, dedup creators, created vs active, sentinel `0`).
5. **Edits never publish, activate, charge or send.** Those need explicit user actions with confirmation.

## Stack and layout

- Next.js 16 App Router (Turbopack), React 19, TypeScript strict, Tailwind CSS v4 (tokens in `src/app/globals.css`), Drizzle ORM on Postgres (PGlite locally), zod, lucide-react icons, Vitest. Cache Components is OFF: pages are request-time rendered.
- Next 16 specifics: `params`, `searchParams`, `cookies()`, `headers()` are async (`await`). Page props: `{ params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }`. Use Server Actions (`"use server"`) for mutations; `useActionState` for forms. `revalidatePath` after mutations. Bundled docs: `node_modules/next/dist/docs/`.
- `src/domain/` — pure, framework-free logic and vocabularies (unit-tested).
- `src/server/` — `import "server-only"`; DB access (`getDb()` from `src/server/db/client.ts`), auth (`src/server/auth/*`), authz, commands, provider adapters. Shared core: `organizations.ts`, `campaigns-core.ts`, `playbooks-core.ts`, `reporting.ts`, `email.ts`, `audit.ts`, `rate-limit.ts`, `crypto.ts` (tokens, AES-GCM sealing), `action-result.ts` (`ActionResult`, `ok`, `fail`, `fromZodError`, `runAction`, `ConflictError`).
- `src/components/ui/` — primitives: `Button/ButtonLink`, `Field/Input/Textarea/Select/Checkbox/FormError/describedBy`, `ChoiceCardGroup` (native radios), `Dialog` (native `<dialog>`), `Badge/PlanBadge/InlineAlert/NotConfiguredNotice/EmptyState/Skeleton/MetricValue`, `PageHeader/Card/CardHeader/CardBody/PageContainer`, `Table/TH/TR/TD/SortHeader/Pagination/TableScroll`, `LinkTabs/Segmented`, `useToast`. Reuse them; extend in place only if you own the file (otherwise add a local component).
- Routes: marketing `src/app/(marketing)`, acquisition `src/app/start`, auth `src/app/auth/*`, onboarding `src/app/onboarding`, workspace shell `src/app/home/[org]/(workspace)/*`, specialized editors `src/app/home/[org]/(editor)/*` (own shell, no sidebar), API `src/app/api/*`.
- Three visual surfaces: marketing (black, white type, `accent` red-orange), onboarding (white, `navy` text, `slate-help` helpers, `slate-line` borders), dashboard (`canvas`/`surface`/`ink`/`ink-2`/`muted`/`selected`/`line`, radii 8/10/12px, 14px controls, 256px sidebar).

## Database

- Schema in `src/server/db/schema/*.ts`. Shared tables are owned by the foundation — do not edit `core.ts`, `campaigns.ts`, `creators.ts`, `money.ts`, `integrations.ts`, `messaging.ts`, `index.ts`. If your area needs a new table, add it to your own `ext-<area>.ts`. If you need a column on a shared table, report it instead of editing.
- Do not run `drizzle-kit generate` (migrations are generated once at integration). `npm run db:push` syncs the local dev DB.
- Use `$inferSelect` types; select only needed columns for lists; paginate server-side.

## Accessibility and UX

WCAG 2.2 AA intent: semantic landmarks/headings, every control labelled, errors tied to fields (`describedBy`), visible focus, keyboard operation (radio cards, dialogs with Escape and focus return, Cmd/Ctrl+K search), reduced-motion respected, ≥44px touch targets on mobile, tables scroll horizontally on small screens, below 768px the sidebar becomes a drawer. Disabled actions explain their prerequisite nearby. Loading uses stable-size skeletons, not zeros.

## Testing and checks

- Unit/integration tests: Vitest, colocated `*.test.ts`. DB tests: `await createTestDb()` (tests/support/db.ts) in `beforeEach`; records via `tests/support/factories.ts`; act as a user with `signInAs(userId)` and `resetRequestContext()` from `tests/support/request-context.ts` (`next/headers` and `next/cache` are mocked globally).
- Before finishing: `npx tsc --noEmit`, `npx eslint <your paths>`, `npx vitest run <your test paths>`. Only report errors in files you own; never "fix" another area's files.
- Running a dev server for manual checks: use your own database and port, e.g. `PGLITE_DIR=.data/pglite-<area> npm run db:push && PGLITE_DIR=.data/pglite-<area> npx next dev -p <port>`; curl with `--noproxy '*'`. Chromium for screenshots: Playwright with `executablePath: '/opt/pw-browsers/chromium'` is available.
- Do not commit; the integrator commits.

## Decisions

Record product decisions you make (where the spec is silent or conflicting) in `docs/decisions/<area>.md` as `<AREA>-NN — decision — rationale — spec reference`. Never present an assumption as observed reference behavior.
