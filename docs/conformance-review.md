# Spec conformance, UX completeness and accessibility review

Scope: every screen in `docs/spec/reference-screen-inventory.json` (M01–M05, O01–O12, D01–D18), checked against `docs/spec/reference-build-specification.md` and `docs/spec/production-ui-plan.md`.

Method: a dev server with an isolated PGlite database and Playwright (Chromium) at 1440×900 and 390×844. Each route was loaded in three states: signed out, an empty workspace (`scripts/dev-account.mts`), and a fixture workspace (`scripts/dev-fixtures.mts`, plus one seeded pending join request). The onboarding wizard was walked with a user who had no workspace, and the member role was checked with a member account. Each route was checked for:

- HTTP status and console or page errors;
- horizontal overflow (`scrollWidth > clientWidth`);
- one `h1` per page, heading-level skips and a `main` landmark;
- unlabelled controls and images without `alt`;
- touch targets under 24px on mobile;
- keyboard behaviour: Tab order and visible focus, Ctrl+K, Escape, and where focus goes when a dialog or drawer closes;
- rendered table column order against the observed snapshots.

## Screen map

Status key: **Implemented** = the screen exists and matches the observed labels and structure. **Implemented (adapted)** = it exists, but the spec's reference-only content was replaced, as a recorded decision requires. **Omitted** = a recorded decision says why it isn't built.

| ID | Screen | Route | Status | Notes |
| --- | --- | --- | --- | --- |
| M01 | Marketing homepage | `/` | Implemented (adapted) | Original hero and copy; no reference claims or metrics (MARKETING-10). CTAs carry `cta` to `/start`. |
| M02 | Pricing | `/pricing` | Implemented (adapted) | Plan names and prices come from `commercial-policy.ts`; preview-pricing notice while terms are undecided (MARKETING-09). Fixed here: 23px horizontal overflow on mobile. |
| M03 | Acquisition step 1 | `/start` | Implemented (proposed) | "Work email" step (MARKETING-01). The spec marks it Unknown. Signed-in users are redirected (MARKETING-07). Fixed here: the page had no `main` landmark. |
| M04 | Acquisition: brand details | `/start` (step 2 of the funnel dialog) | Implemented | Observed fields; validation rules are proposed (MARKETING-02/03). |
| M05 | Acquisition: choose start | `/start` (step 3) | Implemented (adapted) | "Go live when you're ready" (MARKETING-12). "Book a call" appears only when a booking URL is configured (MARKETING-05). |
| O01 | Role | `/onboarding` step 1 of 10 | Implemented | Four observed labels (ONBOARDING-02). |
| O02 | Overview | step 2 | Implemented (adapted) | Icons replace emoji artwork (ONBOARDING-23). |
| O03 | Referral | step 3 | Implemented | Follow-ups for "I have a code" and "Other" are proposed (ONBOARDING-03). |
| O04 | Brand basics | step 4 | Implemented | Creates the workspace exactly once (ONBOARDING-04/05). |
| O05 | Missing capture | none | Omitted | Never observed; progress counts only implemented screens (DEC-014, ONBOARDING-01). |
| O06 | Budget forecast | step 5 | Implemented (adapted) | Shows "Reach estimate unavailable"; no invented numbers (DEC-008, ONBOARDING-06/07). |
| O07 | Reassurance | step 6 | Implemented (adapted) | "Here's your plan so far" summary (ONBOARDING-09). |
| O08 | Content format | step 7 | Implemented | ONBOARDING-10. |
| O09 | Template | step 8 | Implemented | Templates filtered by format (DEC-009, ONBOARDING-11). |
| O10 | Billing threshold | step 9 | Implemented | Options from the commercial policy (ONBOARDING-12). |
| O11 | Payment readiness | step 10 | Implemented | Finish stays disabled until a provider-confirmed card exists; "I'll finish later" works (ONBOARDING-13/14). |
| O12 | Agent connection modal | `/onboarding` (dialog) | Implemented (adapted) | Claude/ChatGPT/Gemini tabs; says the MCP server isn't available and shows no URL (ONBOARDING-17). Focus returns to the trigger on Escape. |
| D01 | Home | `/home/{org}` | Implemented | Counters, Organic views, Ad impressions (never a number without a connection), Active Campaigns, posts (WORKSPACE-15–18). |
| D02 | Live | `/home/{org}/live` | Implemented | WORKSPACE-19. |
| D03 | Organic: campaigns | `/home/{org}/campaigns?tab=campaigns` | Implemented | Columns match L-spec order: selection, Active, Campaign, Views, Spend, CPM, Playbooks, Posts, Creators, Avg Views/post, Budget, Platform. Edit budget dialog returns focus. |
| D04 | Organic: playbooks | `?tab=playbooks` | Implemented | Columns match: selection, Active, Playbook, Platforms, Type, Views, Spend, CPM, Posts, Creators, Avg Views/post, Campaign. The Breakdown dialog returns focus. |
| D05 | Organic: posts | `?tab=posts` | Implemented | Chart, grid/table, created/active modes, UTC date picker (focus returns on Escape). |
| D06 | New campaign | `/home/{org}/campaigns/new` | Implemented | Editor shell; plan-gated sections enforced on the server. |
| D07 | Create playbook | `?tab=playbooks` (dialog) | Implemented | Continue is disabled until a campaign is chosen; Escape returns focus to "Create Playbook". |
| D08 | UGC playbook editor | `/home/{org}/playbooks/{id}/edit` | Implemented (adapted) | AI agent and uploads show "not configured" (`ai_authoring`, `media_storage`). Fixed here: the page had no `h1`. |
| D09 | Ads & submissions | `/home/{org}/ads` | Implemented | Connection prerequisite links to Integrations. |
| D10 | Create ads | `/home/{org}/ads/new?pick=1` | Implemented | Back to Ads / Go to Integrations while no account is connected. |
| D11 | Creators | `/home/{org}/creators` | Implemented | Columns match: selection, Creator, Level, Posts, Views, Likes, Comments, Platforms, Accounts, Posting activity. Detail drawer returns focus. Fixed here: no entry point to the join-request queue (CONFORMANCE-01), mobile filter selects truncated, heading skip. |
| (D11) | Join requests | `/home/{org}/creators/requests` | Implemented (new) | Not in the reference. Reachable from the Creators header for owners, with a pending count. |
| D12 | Integrations | `/home/{org}/integrations`, `/integrations/api` | Implemented (adapted) | Providers show "not configured" until credentials exist. No reference MCP URL or service account. |
| D13 | Ad settings | `/home/{org}/ad-settings` | Implemented | ADS-06–09. |
| D14 | Members | `/home/{org}/members` | Implemented | Members: Name, Email, Role, Joined at (+ Actions). Invites: Email, Role, Invited at, Expires at, Status (+ Actions). The invite dialog returns focus. |
| D15 | Branding | `/home/{org}/branding` | Implemented | |
| D16 | Billing | `/home/{org}/billing` | Implemented (adapted) | Terms come from the policy; the $5 validation charge and matching credit are hidden while disabled (DEC-007). Shown to owners only. |
| D17 | Global search | shell dialog | Implemented | Ctrl/⌘+K and the Search button open it; Escape closes it and returns focus (WORKSPACE-06–08). |
| D18 | Messaging dock | shell overlay | Implemented (adapted) | Team channel only; agent and support channels say they aren't available (WORKSPACE-09–14). Escape returns focus to "Messages". |

## Defects found and fixed

1. **Join-request queue had no entry point.** Nothing in the UI linked to `/home/{org}/creators/requests`. The Creators header now shows "Join requests" (owners only), with a badge for the pending count, for example "Join requests 1 pending". Checked in the browser: the link is visible to owners at both widths (44px tall on mobile) and goes to the queue; members don't see it. Regression test: `src/server/campaign-admission-count.test.ts` (the count covers only this org's pending requests and drops after a decision).
2. **Horizontal page overflow at 390px on `/pricing`.** An absolutely positioned `sr-only` span inside the comparison table escaped its `overflow-x-auto` wrapper, which wasn't positioned, so the page scrolled sideways by 23px. Fixed by adding `relative` to that wrapper and to the shared `TableScroll` primitive (`src/components/ui/table.tsx`), which has the same latent problem. Re-measured: 0px overflow.
3. **Heading outline h1 → h3** on Organic campaigns and playbooks (empty states), Creators, Join requests, creator Submissions, Billing (member view) and the ops queues. `EmptyState` always rendered an `h3`. It now takes `headingLevel` (CONFORMANCE-02), and these pages pass 2.
4. **No `h1` in the playbook editor.** The playbook name is an input, so the page had no top-level heading. Added a visually hidden `h1` ("Edit playbook: <name>") inside the editor's `main`.
5. **No `main` landmark on `/start`.** The page wrapper is now `<main>`.
6. **Creators filter selects truncated on phones** ("All cam", "All leve"). Each select now has a 9rem minimum width, so at 390px they should wrap two per row. This is worked out from the widths; it was not re-checked with a screenshot after the change.

## Verified without defects

- No console errors or page errors on any route, in either workspace state, at either width. No horizontal overflow after the fixes.
- Keyboard: skip link first; every focused control showed a 2px solid outline in the Tab sequence. Escape closes each of these and returns focus to its trigger: Ctrl+K search, the search button, messages dock, Create Playbook, Edit budget, Breakdown, date picker, Invite Members, the creator drawer, the mobile navigation drawer and the onboarding agent dialog.
- No unlabelled form controls and no images without `alt` were detected on any walked route, including all ten onboarding steps at both widths.

## Remaining gaps (not fixed)

- **Touch targets under 44px on phones.** In table headers, sort links are about 16px tall and the selection checkboxes are 16×16 (Organic, Creators). The "details" toggles on Integrations cards are 23px. Inline text links (for example "Forgot password?") are exempt under WCAG 2.5.8. The table controls mostly meet the 2.5.8 spacing exception, but not the project's ≥44px mobile goal. Fixing them means changing shared table and sort-header styling, which is a design change, not a local fix.
- **Search dialog input** turns off the outline on focus. The open dialog and the caret make focus clear, but there is no separate focus ring.
- **Not walked in a browser:** the creator portal (`/creator/*`), operator console (`/ops/*`), `/invitations/[token]`, `/auth/verify` and `/dev/outbox`. None of them is in the reference inventory. The empty-state heading fix was applied to the ops and creator Submissions pages from code inspection only.
- **Not compared visually:** the evidence images in the scratchpad bundle were not compared pixel by pixel. Labels and column orders were checked against the spec text, which records the observed snapshots.
- **Terms and Privacy pages** are still missing (MARKETING-08).
