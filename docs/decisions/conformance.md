# Conformance review decisions

Format: `CONFORMANCE-NN — decision — rationale — spec reference`.

- CONFORMANCE-01 — The Creators page header shows a "Join requests" link to `/home/<org>/creators/requests` for owners (`creator:manage`) only, with a pending-count badge when there are pending requests (read with `countJoinRequests`, read aloud as "<n> pending"). Members don't see the link. — The admission queue existed with no way to reach it from the UI. Members can't act on requests, and the queue page already tells them so. — reference-build-specification.md L10 (Creators) is silent on admission; production-ui-plan.md (disabled or unavailable actions are explained, with no dead ends).
- CONFORMANCE-02 — `EmptyState` takes `headingLevel` (2 or 3, default 3). Pages whose empty state sits directly under the page `h1` pass 2, so the heading outline doesn't jump from h1 to h3. — WCAG 1.3.1 / heading order. Other uses keep h3 because they sit under an h2 section. — CLAUDE.md "Accessibility and UX".
