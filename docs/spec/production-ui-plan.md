# Production UI plan for the Noise-equivalent application

## Purpose and evidence boundary

This plan turns the saved screen map into a production interface backed by real organization data and configured providers. It does not scaffold the application or claim that provisioning is complete. Inputs are `outputs/noise-screen-inventory.json`, `work/onboarding-spec.md`, `work/dashboard-spec.md`, `work/api-and-domain-spec.md`, and `work/evidence-audit.md`.

Use **Observed** for A/B screenshot and L01–L38 interface evidence, **Documented** for public behavior in the existing specification, and **Proposed** for this application's new behavior. Observed controls were inspected without submitting writes. Connected providers, successful payments, ad launch, populated reports, fresh signup, mobile layouts, and most errors remain unobserved. Recreating those workflows requires explicit application contracts rather than guessed Noise internals.

The production interface must never seed account analytics with marketing numbers, reference-account IDs, invented creators, or simulated events. A verified empty query may show zero. An unconfigured source, failed request, pending sync, or unavailable metric must show its actual state, not zero. Test fixtures are isolated from production and are never presented as customer activity.

## Application surfaces and shared components

Preserve the reference's three distinct treatments:

- Public site: dark particle/resonance hero, white type, orange-red accents, product demonstrations, conversion content.
- Onboarding: white canvas, navy/dark text, blue-gray helper text and borders, orange introductory action, segmented footer progress.
- Dashboard: warm neutrals, white cards, compact navigation, thin borders, measured 256 px expanded sidebar, 14 px common control text, 10–12 px radii. Measured colors include primary `#1c1917`, sidebar text `#44403c`, muted `#78716c`, selected fill `#edebe9`.

Reusable components: PublicHeader/Footer, ProductMenu, ConversionModal, AuthForm, OnboardingShell, StepProgress, SelectableCardGroup, ProviderAgentDialog, WorkspaceSidebar, OrganizationSwitcher, GlobalSearchDialog, PageHeader, DateRangePicker, MetricCard, ReportChart, DataTable, FilterPopover, EmptyState, InlineError, IntegrationCard, SettingsForm, UploadField, RoleGate, EntitlementGate, SaveStatus, ConfirmationDialog, Toast, and MessagesDock. Specialized CampaignForm and PlaybookEditor shells share controls but do not inherit the ordinary dashboard layout.

Every data component consumes distinct pending, success-empty, success-populated, stale, and error states. Server capabilities identify provisioned providers, permissible actions, current plan entitlements, supported formats/platforms, and available reporting metrics. Hidden/disabled UI is supplementary to server enforcement.

## Routes and minimum functional contracts

Routes matching inspected paths are observed; routes for new auth, onboarding, or uninspected details are proposed. `{org}` and entity IDs always resolve from authorized server data.

| Route/surface | Components and minimum working behavior | Evidence/limit |
|---|---|---|
| `/` | Public header, responsive hero, product sections, five-step workflow, integrations, footer; working menus and CTA navigation | A01/L30. Use authorized assets and supportable claims; no pretend analytics demo |
| `/pricing` | Plan cards, feature comparison, active plan/price data, start/upgrade navigation | L29. Actual product prices and credit policies must come from billing configuration |
| `/creators` | Creator-facing explanation and real registration/application action if creator onboarding is supported | Link observed; destination implementation uninspected and proposed |
| `/start?cta=...` | Preserve attribution; existing authenticated organization redirects to Home; new visitor enters configured signup/acquisition | L31 existing-account redirect; acquisition step 1 unknown |
| `/auth/sign-in`, `/auth/sign-up`, `/auth/reset`, `/auth/callback` | Real identity-provider flow, verification, safe return URL, errors, logout, session refresh | Proposed; no fake login or client-only Owner assignment |
| `/onboarding` | Server-persisted organization draft; known screens below; resume and previous-step state | Proposed route; screen content from A04–B07 |
| `/home/{org}` | Greeting, 24-hour/60-minute views, UTC date range, organic/ad reports, active campaigns and posts; links preserve dates | L01. Query real metrics; connection and empty states remain explicit |
| `/home/{org}/live` | Real rolling counters, freshness, location visualization only with actual permitted city aggregates | L09. Map/transport unknown; no fabricated dots or activity |
| `/home/{org}/campaigns?tab=campaigns` | Campaign table, sort/page, select, active state, budget editor, campaign drilldown, create action | L02. Server confirms status/budget changes; campaign begins inactive |
| `/home/{org}/campaigns?tab=playbooks&campaign=...` | Campaign filter, playbook table, sort/page, edit, breakdown, create chooser | L03. Scope counts deliberately; do not infer active from switch label |
| `/home/{org}/campaigns?tab=posts` | Real metric selections/chart, search, Campaign/Playbook/Platform filters, grid/table, created/active range mode | L04/L33–L36. Populated details proposed; lifetime versus range metrics labelled |
| `/home/{org}/campaigns/new` | Name/hashtag, Slideshow/UGC, budget/pricing, targeting, approvals, estimates, validation, create/persist | L17–L22. Actual entitlement/config catalog; estimates unavailable without a real model |
| Create-playbook dialog | Campaign chooser, empty campaign/create route, Cancel/Continue, server creates campaign-attached draft | L23; downstream creation flow is proposed |
| `/home/{org}/playbooks/{id}/edit` | Editable name, Draft/Publish state, reference media, instructions, ordered scenes, text options, hashtags/descriptions, app preview | L05–L07. Persisted draft, save feedback and revision conflicts; validated publishing |
| Slideshow editor, same entity route | Ordered slides, permitted image/caption variants, description options, hashtag rules, preview | Documented format; layout and current write flow proposed, kept separate from UGC |
| `/home/{org}/ads?view=...` | All ads/Submissions, date range, connection gate, real provider job/status results, create action | L08/L37; populated rows proposed |
| `/home/{org}/ads/new?pick=1` | Back/integration gate; after connection, select eligible post/submission, destination, copy/link/CTA, review and confirmed launch | L38 gate observed; connected flow proposed and provider-dependent |
| `/home/{org}/creators` | All/Removed, real summaries, search/filters, sortable table; authorized detail/actions | L10. No public scraped roster; detail, remove/restore and activity chart layouts proposed |
| `/home/{org}/integrations` | Provider cards, status, real connection/validation, permission feedback, sync timestamps, disconnect/reconnect | L15–L16/B08–B09; detailed contract below |
| `/home/{org}/ad-settings` | Copy templates, naming conventions, URL parameters, provider-specific default CTAs, dirty state and Save | L11/L26–L28. Actual accepted provider values; changes affect new launches |
| `/home/{org}/members` | Members/invites tables, searches/pages, real invitation delivery, expiry, role/remove controls as authorized | L14/L32. Proposed role selector reconciles incomplete captured dialog |
| `/home/{org}/branding` | Name/hashtag/categories, logo/cover, color, sanitized rich description, site/store links, live preview, Save | L12. Catalog comes from application taxonomy; upload limits validated |
| `/home/{org}/billing` | Actual plan, ledger balance/credits/threshold, payment/business data, activity filters, invoices, upgrade/manage payment | L13. Money/credit rules must be implemented and disclosed consistently |
| Search overlay | Pages plus authorized entity search, keyboard results, empty/error states, org isolation | L24; ranking/result layout proposed |
| Messages overlay | Minimized/floating/docked presentation, channel list and genuine persisted messages with delivery status | L01/L09. Support/team identity and AI capabilities require configured services |
| Resources | Working documentation/help/social links; documentation reflects this application's actual providers and policies | L25. Do not expose a nonfunctional classic dashboard link |

Normalize malformed tab/date/filter query values, enforce tenant access before content loads, and handle unauthorized versus nonexistent entities without leaking another organization's data. UTC aggregation and timestamp display timezone remain distinct. Apply commits date selection; Cancel discards edits. Browser back/forward restores encoded route state.

## Onboarding implementation contract

Marketing acquisition and platform onboarding remain separate state machines. Lead fields use the exact labels and budget-band choices in `onboarding-spec.md`; submitted leads persist to the real service. Sales actions navigate to an actual configured contact/booking destination. An unconfigured destination must not pretend that a message was sent.

Platform screens: role → overview → referral → brand basics → unresolved position 5 → budget → reassurance → format → template → billing threshold → payment. Keep reference indices in the evidence map, but production progress counts only screens that are actually implemented. Do not ship an unexplained blank fifth screen or claim a new question was observed.

- Role: Founder, Creator, Operations, Other are known. Preserve those labels. The two hidden labels remain unresolved; use a verified configurable role catalog or ship a clearly recorded reduced/proposed set.
- Referral: Google Search, Social Media, Podcast, YouTube, TikTok, I have a code, Other. Proposed conditional code/Other inputs require actual server validation and optionality rules.
- Brand: Name, website/App Store link, short description. Never default to Test, Testingcreators, Annie, or Diaz. Proposed limits and required-field rules must be deliberate and consistent with the server.
- Missing acquisition step 1: use the provisioned identity flow as a new design and document the substitution. Missing platform position 5: omit until requirements exist or add a justified product step explicitly marked Proposed in implementation records.
- Budget: persist actual currency/daily target. Display a forecast only if an implemented service returns assumptions, period, freshness and uncertainty. Without it, retain budget selection and say “Reach estimate unavailable.” Do not hard-code 20 million views or 8,333 creators.
- Reassurance: summarize saved settings. Replace claims of achievable reach with qualified real forecast text when available; otherwise explain the next task without a numeric promise.
- Format/template: templates have explicit compatible formats. On format change, retain a compatible choice or request reselection. The Slideshow/Greenscreen screenshot mismatch is not an automatic conversion rule.
- Threshold: $10/$25/$50 are observed monetary increments, not schedules. Show only thresholds implemented by the real billing policy.
- Payment: provider-hosted setup/embedded approved component, verified server result, pending state, and an operational “finish later” path to a draft workspace. Publishing remains gated by real payment/policy requirements.
- Agent dialog: tabs for supported configured clients, real deployment MCP URL, copy feedback, instructions, connection status and error recovery. Do not connect the duplicate application's users to Noise's original MCP endpoint by default.

The $500 matching offer and “nothing up front” copy are conditional on this application's actual terms. Live Billing disclosed a non-refundable $5 validation credit while screenshots suggested no upfront charge. Resolve the real policy before shipping money flows; the selected policy is disclosed before confirmation and used consistently in onboarding, pricing, billing, and receipts. Basic/Standard tier names also require a single configured mapping.

## Integration UX contracts

All credentials travel to the server through authenticated tenant-scoped endpoints. Provider secrets are never returned in general settings payloads, analytics logs, page source, or client persistence. Connection status is determined by provider verification and stored server state, not a clicked button. States: not configured, not connected, connecting, connected, syncing, reconnect required, and error. Display connecting member, permissions, selected assets, last successful sync, latest error category, and retry/reconnect action where relevant.

| Provider/surface | Inputs and required user-visible behavior |
|---|---|
| Identity | Provisioned provider verifies sessions and organization membership. Show verification needed, callback failure, expired session, wrong invite account, and safe continuation; retain nonsensitive draft fields |
| App Store Connect | Issuer ID, Key ID, private .p8 input/upload; Validate key performs real scoped verification; identify authorized apps; explain read-only reporting access; never echo private contents after submission |
| Google Play | Actual application service-account identity, package name, report bucket ID; user follows permission instructions; Connect verifies accessible reporting resources; distinguish missing permissions, package mismatch, unavailable report and sync delay |
| Meta Ads | Business-portfolio/personal choice where supported by the provisioned Meta app; provider authorization, actual account/Page/Instagram selection, scope result, token expiry/reconnect and denied-consent handling; do not mark connected before callback and verification |
| TikTok Ads | Provisioned authorization and advertiser selection; real granted ads scopes; cancelled/denied callback, no eligible advertiser and expired connection states; actual provider IDs persist server-side |
| AI/MCP | Own authenticated MCP server URL; current member's allowed tools; connection code only if implemented; list connected clients with owner/time/revoke; preview and explicit confirmation for consequential tool mutations; real model/service availability |
| Reporting API | Own organization identifier and API base URL, genuine masked credential metadata, authorized reveal/copy/rotation behavior, scope documentation and last-used data if recorded. Rotation warns about affected consumers and confirms server completion |
| Payment/billing | Real processor setup/checkout/customer portal; selected billing threshold; explicit actual fee/credit policy; pending confirmation and webhook reconciliation; never render success solely from a return URL |
| Messaging/invitations | Persisted messages and provider-backed invitation delivery; queued/sent/failed/accepted states come from server events; unsupported support/AI channels are not populated with fake conversations |

OAuth callbacks use verified state/return targets and provider-supported protections; cancelled authorization returns to the initiating card without changing status. A connected card does not imply every capability is available. Separate report import, account validation, and ad publishing permissions. Provider app approval, organization permissions, unavailable APIs, or rate limits may restrict operation after deployment; reflect the specific capability rather than pretending the integration works.

Ads must show the actual connected account, destination, media eligibility/authorization, configured spend settings, and a review summary before launch. Job submission is distinct from provider acceptance and active delivery. Show queued, processing, published/active, rejected, paused and failed states only where backend/provider status supports them; expose the provider's actionable rejection explanation and prevent duplicate submissions.

## Empty, loading, stale and failure behavior

| Context | Required production state |
|---|---|
| First workspace | No campaigns/playbooks/posts/creators with specific creation guidance; no demo records inserted |
| Metrics loading | Stable-size skeleton or pending label; no temporary zero treated as fact |
| Metrics unavailable | “Reporting not connected” or specific unavailable metric; preserve filters and link to setup |
| Successful empty report | Zero only for defined available counters; chart empty explanation, no synthetic trend line |
| Stale report/sync | Last successful result plus updated-at/stale notice; failed refresh does not silently erase data |
| New budget estimate | Pending while recomputing; invalidate old assumptions; unavailable/error result never becomes a guarantee |
| Save/create failure | Retain editable fields, display validation by field and request error; retry uses idempotent server command where needed |
| Concurrent edit | Explain newer server revision; reload/compare/reapply strategy, no silent overwrite |
| Upload | Progress/cancel, actual validation and storage status, retryable failure; missing thumbnail uses neutral placeholder |
| Payment uncertain | “Payment status is being confirmed,” refresh/status recovery; no immediate second charge action |
| Rate limit | Explain temporary limit and actual retry window if known; retain the last confirmed result |
| Permission/plan gate | Actual role/entitlement reason, permitted view-only behavior, usable upgrade/contact route only if configured |
| Search/filter empty | Distinguish no matching results from no organization records; offer clear filters |

Campaign/creator/post actions update the interface after confirmed state. A pause is separate from playbook draft/published status. Publishing validates referenced assets and required content; running campaigns additionally depend on eligible creators, valid posts, metering and earning rules. A deployed brand dashboard alone does not supply those underlying production services.

## Asset requirements and provenance

Maintain an asset manifest with owner/source, allowed use, and approval status. The reference bundle is design evidence; it does not establish redistribution rights to photographed creators, third-party TikTok clips, reference videos, client logos, or illustrations.

Needed assets: product wordmark/symbol authorized for the deployed brand; approved hero portrait/name combinations or a neutral hero treatment; an original particle background; licensed/original onboarding illustrations; neutral provider/platform icons permitted by their brand terms; user-owned logo/cover uploads; and approved template/demo media with explicit allowed formats and usage. Never crop screenshot faces/clips into production assets on the assumption that public visibility grants rights. Until media is supplied, use neutral geometry, icons and functional text rather than fake people or fabricated creator performance.

Real creator avatars and post thumbnails render only from authorized organization/provider records under the actual media-use arrangement. Missing images use initials/neutral placeholders. No image is presented as a real customer, creator or submitted post unless the underlying record establishes it. Empty states do not require invented social proof. Marketing demonstrations can explain controls with nonnumeric illustrative diagrams; any actual published performance claim needs its own support.

## Proposed mobile and accessibility behavior

These behaviors are new design because responsive layouts were not inspected. Below 768 px, collapse navigation into a modal drawer; keep organization context and a labelled menu action. Use one-column onboarding forms and role cards, full-width actions, and a compact textual “Step X of Y” alternative to the segmented bar. Put Back/Next in a bottom area that respects safe insets and does not obscure validation or the keyboard. On larger tablets, retain a collapsible sidebar; specialized editors use stacked panels with scene navigation and preview tabs.

Wide tables remain horizontally scrollable with clear column headers and accessible row actions; critical name/status fields stay discoverable. Do not silently drop spend, status or financial columns. Content/template cards wrap or use a keyboard-accessible list. The date picker becomes a single-month layout. Messaging opens a full-width panel on phones; minimized, floating and docked modes are mutually exclusive in the accessibility tree.

Target WCAG 2.2 AA as a proposed product requirement: semantic landmarks/headings, labelled fields and instructions, field-associated errors, keyboard radio-card selection, visible focus, 44 px practical touch targets, compliant text/control contrast, Escape/focus restoration for dialogs, and reduced-motion hero/map behavior. Offer Ctrl+K and Cmd+K search. Provide text/table alternatives to charts and location visuals; loading and save feedback use restrained live announcements. Currency inputs state currency; UTC report dates are explicit; disabled actions explain prerequisites nearby. Drag scene/naming order has keyboard move controls.

## Completion checks and dependencies

The UI is complete only when real identity → organization creation → persisted onboarding → campaign/draft creation → asset upload → publish eligibility → real reporting is exercised against authorized test resources. Provider-specific checks verify both callback status and actual allowed operations, including expired/denied connections. Billing checks verify actual setup, ledger events, threshold handling and webhook confirmation without duplicate charges. Tenant isolation, role/entitlement enforcement, invitations, credential rotation, error recovery and resumed drafts receive meaningful tests.

Visual review covers the supplied desktop references plus proposed 320–375 px mobile, tablet and large desktop layouts; inspect loading/empty/error/populated states using isolated test records. Do not claim observed fidelity for missing screens or populated layouts. Before implementation handoff, backend owners supply authoritative endpoint/types, capabilities, auth/org lifecycle, media storage policy, provider configuration, forecast availability, billing terms, creator/post ingestion, metric freshness, mutation permissions and idempotency behavior. Until a dependency is available, its production state remains honest and actionable rather than simulated.
