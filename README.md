# Creator platform

Brand-side creator-marketing platform: public site, acquisition funnel, brand onboarding, workspace (campaigns, playbooks, creators, reporting, ads), integrations and billing. Specifications live in `docs/spec/`; decisions in `docs/decisions.md`.

## Develop

```bash
npm install
npm run dev          # syncs the embedded dev database (.data/pglite), then starts Next.js on :3000
npm test             # unit + integration tests (in-memory Postgres)
npm run typecheck
npm run lint
```

Without any provider credentials the app runs fully locally: data is stored in an embedded Postgres (PGlite), and emails are recorded but not delivered (read them at `/dev/outbox` in development).

## Configuration

See `src/server/env.ts` for every variable. Production requires `DATABASE_URL` and `AUTH_SECRET`; each provider (Stripe, email, Meta, TikTok, Google Play, credential encryption) is optional and reports "not configured" until set. Apply schema changes with `npm run db:generate` + `npm run db:migrate`.
