# Production requirements for an equivalent Noise platform

Prepared October 14, 2026. Inputs: `outputs/noise-build-specification.md`, `outputs/noise-screen-inventory.json`, and official vendor documentation cited below. This is a **proposed production contract**, not a recovered Noise backend. No application files, provider resources, credentials, payments, advertisements, or external account settings were changed for this analysis.

The specification inventories 35 product screens across website, onboarding, and dashboard; 38 inspected live states are supporting evidence, not 38 separate full features. The observed workspace had no posts, creators, payment method, or ad connection. A faithful dashboard is only one part of a production marketplace: creator participation, review, data ingestion, financial settlement, and integration operations must exist behind it.

## 1. Provisioning categories and service boundaries

Follow the root provisioning workflow before app scaffolding: **categorize → discover → install → inspect provisioned capabilities/environment → build**. For account/dashboard claim steps, complete the required provider interaction and resume. A configuration example or disconnected mock adapter does not constitute provisioning. The root agent owns Vercel/provider selection and installation; this document creates no alternative resources.

| Capability | Category / guidance | Production responsibility |
|---|---|---|
| Application hosting and domains | Vercel deployment/domain guidance | Separate preview and production, TLS, stable callback URLs, rollback, controlled environment promotion |
| Tenant data and financial records | Storage dedicated guidance | Transactional persistent database, tenant constraints, migrations, backup/restore, durable ledger |
| Sign-in and sessions | Authentication dedicated guidance | Brand, creator, operator identities; verified email, session/recovery/offboarding, server permissions |
| Brand charging and creator payouts | `payments`: Stripe preferred because this is a service platform, not a storefront | Hosted card collection, off-session charging, invoicing/subscriptions, Connect payout onboarding and settlement |
| Invitations and operational email | `messaging`; choose provisioned discovery result | Verified sending domain, actual invitation delivery, bounce/suppression handling, transactional templates |
| Uploads and media | Object storage; `video` if transcoding/streaming required | Private tenant assets, signed upload/download, media processing, malware/type validation, retention |
| In-app messaging | Persistent conversations + provisioned realtime/messaging capability | Participant authorization, delivery/retry, unread counts, abuse controls; email notifications distinct from chat |
| Background ingestion/settlement | Dedicated Vercel Workflow/Queues guidance | Durable scheduled jobs, retries, deduplication, concurrency limits, dead-letter/replay operations |
| AI authoring/agent | AI dedicated guidance; separate MCP interface | Provisioned model access, scoped tools, audit, generation costs, revision previews |
| Error monitoring and operations | `observability`, `monitoring`, `logging` as needed | Failed sync/charge/payout alerts, traceable job history, secret-redacted logs, readiness visibility |
| Optional large-scale global search | `searching` only if database search is insufficient | Tenant-filtered campaigns, playbooks, posts, creators; never index secrets or inaccessible records |

Marketplace installation is infrastructure, not business authorization. The product's Meta/TikTok/Apple/Google integrations require its own provider apps and customers' explicit connection grants. Do not reuse the Noise reporting key, Noise service-account email, Noise OAuth apps, or Noise's MCP endpoint as this product's backend.

## 2. Operational requirements missing from dashboard evidence

### Creator onboarding and fulfillment

Build a creator-facing portal, even if the initial brand UI mirrors the inspected dashboard. It needs creator registration, verified social-account association, profile/country/platform, campaign discovery and admission, eligible playbook access, creator-specific generated content, submission URL/file upload, submission history, earnings balance, and payout-readiness status. Model creator-level criteria as a defined product policy; Noise's Bronze/Silver/Gold/etc. thresholds were not recovered. No fabricated creators, account counters, location dots, or anticipated traffic belong in production totals.

Separate these stages: **identity/account ownership → campaign admission approval → playbook publication → content submission → content review → qualifying views → earnings → payout**. The current Unlimited creator-approval control concerns admission, not automatic post-content review. Retain rejection reasons, resubmission and appeal/review audit. Dedicated-account ownership must be independently verified; a user-entered handle is insufficient.

### Campaign and playbook operations

Persist drafts and explicit versions. Publishing creates a distribution version, not a silent campaign activation or charge. Freeze the playbook/version and rate policy attached to each submission so later edits do not rewrite earned obligations. Implement Slideshow and UGC schemas separately; compatible template selection, ordered scene/slide controls, references, descriptions, hashtags, combinatoric previews, and creator-specific selected variations must persist.

Daily/dynamic pricing and Manual/fixed rates are separate modes. Fixed rates need country/platform specificity, post caps, atomic budget reservations, 30-day windows, renewal, exhaustion, and audited resets. Dynamic pricing needs a chosen rate controller, weekly-target reconciliation, inventory inputs and risk limits; the original algorithm is unknown. Do not use the onboarding $1,000/day → 20M forecast as the payout formula. Forecasts should expose assumptions and remain separate from actual reporting.

### Review, metric ingestion, and earnings

Use provider adapters that record external IDs, account ownership, source, fetched time, report dates, request outcome, and raw observations. Cumulative counters require correction-aware delta accounting; a retry or decreasing counter must not double-pay. Define valid-view policy, time windows, fraud/duplicate rules, rate lock time, rounding, payout caps, pause boundaries, reversals, and charge-failure exposure before enabling earning jobs. Observed docs say paused campaigns earn nothing, including old posts; reactivation/backfill behavior requires a chosen contract.

A review system must apply campaign requirements before earnings. Rule automation can cover objective requirements; ambiguous content needs an operator queue. Account administrators need review history, exceptions, disputes, identity mismatch handling, and a reversible audited correction process. Do not label an AI-only classifier as recovered Noise moderation.

Keep **creator earnings**, **brand campaign spend**, **brand cash charges**, **promotion/subscription credits**, and **external ad spend** distinct. Reconcile provider settlement independently from internal obligations. New account reports are zero/empty only when confirmed; connection/data gaps are unavailable or stale, not zero.

### Billing and credits

Resolve four contracts before live charging: Basic versus Standard identity; whether Unlimited is a $99 minimum spend credited to campaigns; whether payment setup charges the observed $5 non-refundable validation credit; and matching-credit eligibility, drawdown, expiration, refunds, and cancellation. Show one consistent disclosure at setup and confirmation. $10/$25/$50 options are charge thresholds, not scheduled charge intervals.

Collect cards through Stripe-hosted/tokenized UI; store provider references rather than card numbers. Define off-session consent, threshold accumulation, partial charges, retry/dunning, disputed/refunded charges, final balance collection, and when unpaid organizations stop earning liabilities. A payment-return URL is not settlement proof. Webhooks are public HTTPS, signature-validated, asynchronous, deduplicated and ordering-independent; Stripe explicitly documents duplicate and out-of-order delivery. [Stripe webhooks](https://docs.stripe.com/webhooks), [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)

For payouts, enable the chosen Stripe Connect model and supported countries/capabilities, use hosted onboarding, and verify outstanding requirements/payout status after return. Redirect completion alone does not establish verification; monitor `account.updated` and failures. Creators complete their own identity/bank requirements. Funding source, payout timing, fees, negative balances, reserves, and payout reversals remain operator decisions. [Stripe-hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding)

### Ads and rights

Paid launch needs a connected advertiser account, selectable destination/ad set or ad group, creator authorization, authorized asset, copy/link/CTA defaults, naming rules, preview, confirmation, provider creation, status sync, and platform-spend reporting. Organic-post ownership or upload permission does not alone grant paid-ad rights. Persist authorization scope/expiry and rights evidence; block launch after expiry or revocation. Default changes affect future drafts unless the product explicitly applies them to existing ads.

Launch jobs need idempotent external-object mapping and recovery from partial success. Create paused/draft external objects during controlled validation where supported; do not equate successful object creation with an approved, delivering ad. Live-spend validation requires an authorized advertiser and a reviewed spend limit.

## 3. Credentials, provider reviews, and customer actions

No secret values belong in this document or chat. Credentials must be created for the new product and supplied through provider/Vercel secret controls. The following is a readiness inventory, not a claim that any provider has approved or connected it.

| Integration | Credentials / identifiers needed | External prerequisite and acceptance |
|---|---|---|
| Vercel + database + auth | Linked project/team, selected provider resources, server credentials, permitted domains/callbacks | Account/resource claiming as required; production/preview isolation; verified session and tenant access |
| Stripe brand billing | Product's test/live keys, hosted UI key, endpoint signing secret, customer/price references | Activated business account and confirmed commercial policy; successful sandbox charging/webhooks before live mode |
| Stripe creator payouts | Connect-enabled platform and connected account IDs; account requirement/capability state | Creator-hosted onboarding and eligible payout account; platform countries and fund flow selected/reviewed |
| Email | Provider key, verified sender/domain, webhook secret if applicable | Domain DNS/verification; receipt of a real test invitation; suppression and bounce behavior |
| Meta Ads | Product app ID/secret, registered redirect URI, granted tokens, permitted business/ad-account/Page/Instagram asset IDs | Exact permissions and customer/business grants approved for intended operations; refresh/revoke and launch/report tests. Current API access-tier terminology is Limited/Full, separate from `ads_management` permission. |
| TikTok Ads | Product Business developer app/secret, redirect, advertiser authorization token/ID; content authorization | Business account/developer registration/app access, authorization and permitted scopes; advertiser and creator grants; verified ad/report test |
| TikTok organic | Separate approved developer app/scopes as necessary; creator-authorized token and video IDs | `video.list` video query verifies videos belong to the authorized user and exposes available counters; this is not arbitrary account scraping. |
| YouTube organic | Product Google project, enabled API, appropriate key/OAuth credentials, verified channel/video association | Verify quota and permission coverage for intended reads; requesting uploads is a separate audited feature, not required merely for tracking submissions |
| Snapchat organic | Product-approved Public Profile API access, client credentials/token, profile/content identifiers | Verify actual access and available content metrics; additional audience insight requires opt-in/OAuth; do not infer approval from a targeting-menu option |
| Instagram/Facebook organic | Product's approved API path and account/media grants | Confirm supported account types, counter fields, ownership verification and review scope separately from Meta ad access |
| App Store Connect | Customer Issuer ID, Key ID, new Team `.p8` key with appropriate report access; app identifiers | Customer Account Holder API access and key permission; securely validate actual report access, not just JWT generation |
| Google Play | Product-controlled service-account identity/credential or workload identity, customer package and report bucket | Customer invites this product's service account with required read-report permissions; authenticated sample retrieval and schema validation |
| Estimated installs | Licensed estimate-provider agreement/API access if included | Choose a legitimate source and document blend/provenance; Noise's SensorTower use does not confer this product a license |
| MCP | Product authorization-server/client registration and signing setup; scoped per-client grants | Stable HTTPS server/metadata, tested client authorization, tenancy and revocation; never expose the Noise connector URL as this product's own |
| AI authoring | Provisioned model/gateway credentials and budget controls | Confirm model access; generated playbooks remain drafts until explicit publish |

Meta changed its feature name to **Marketing API Access Tier** in May 2026; do not reuse old tier/permission terminology interchangeably. The exact permission set still needs review against the new app's operations. [Meta access-tier update](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)

TikTok Business onboarding is developer registration → app → authorization → authentication; Spark Ads require separately authorized creator content. Organic Display video query is a different API surface. [TikTok Business workflow](https://ads.tiktok.com/gateway/docs/index?doc_id=1781891830241281), [Spark Ads authorization](https://ads.tiktok.com/business/library/Generate_SparkAds_on_TTAM_via_PushnPull.pdf), [TikTok video query](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query)

YouTube exposes video statistics, while uploading unverified-project content has separate restrictions. Snap distinguishes public discovery metrics from richer opt-in/OAuth data. These docs establish candidate APIs, not granted application access. [YouTube video resource](https://developers.google.com/youtube/v3/docs/videos), [Snap Public Profile API](https://developers.snap.com/marketing-api/Public-Profile-API/Introduction)

Apple recommends Sales and Reports for third-party report processing, but **Admin must request a new analytics report type initially**; downloading previously generated reports is a separate capability. Team keys span apps and must remain server-only. Google Play bulk data is captured daily but may arrive **3–7 days later**, so a five-minute dashboard refresh does not imply current install data. Preserve provider report timing and freshness per source. [Apple analytics roles](https://developer.apple.com/documentation/AppStoreConnectAPI/downloading-analytics-reports), [Apple key security](https://developer.apple.com/documentation/AppStoreConnectAPI/creating-api-keys-for-app-store-connect-api), [Google Play reports](https://support.google.com/googleplay/android-developer/answer/6135870?hl=en)

## 4. Security and production acceptance checklist

These are implementation requirements for the new product. Provider-account operations, real ad launch, and charging must occur under the user's authorized scope; provider review/customer consent cannot be bypassed by code.

1. **Tenant isolation:** every read/write/search/download/worker operation enforces organization membership or explicit creator assignment. Guessing another org/entity ID yields no access. Member cannot view billing; only primary owner transfers ownership; owner cannot arbitrarily promote peers outside the chosen policy.
2. **Entitlements:** server checks Unlimited actions, not just UI badges. Expired/downgraded plans cannot create gated settings by direct requests. Plan downgrade has an explicit existing-campaign policy.
3. **Secret handling:** encrypted provider credentials, server-only environment values, token-redacted logs, masked forms, no secrets in URLs/local storage/client bundles. Record who connected each account; rotation/revocation and member offboarding must be tested. Noise's shared-key survival caveat need not be copied without an explicit decision.
4. **OAuth:** exact registered redirects, bounded one-use state, PKCE where supported/required, issuer/audience validation, least privilege, safe refresh/revocation and wrong-account refusal. Use stable callback origins, not arbitrary preview URLs.
5. **MCP:** protected resource metadata and authorization discovery; audience-specific tokens; read versus mutation scopes; role/tenant checks on every tool; never pass client tokens through to downstream providers. Mutations use bound preview/confirmation with expiry and version checking; no client-supplied org identifier authorizes access. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [MCP security](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
6. **Input/media:** escape rich content, safe external links, signed uploads, MIME/size limits, processing isolation, unguessable authorized downloads. Server-fetching reference URLs blocks private/metadata networks and unsafe redirects.
7. **Financial invariants:** duplicate submissions/observations/events/jobs never create duplicate liabilities or charges; concurrent workers cannot exceed fixed budgets/post caps. Paused/unapproved posts earn zero. Exact rounding, correction and reactivation policies have meaningful tests.
8. **Settlement:** expired card/required authentication/failed payment/refund/dispute and missing payout capability each produce recoverable states; webhook reordering/replay reconciles to provider truth. Never mark paid from a browser redirect.
9. **Metrics:** UTC boundaries and created/active modes verified; period CPM weighted; creators deduplicated; source-missing versus zero distinguished; install raw series never summed into blended totals or attributed to campaigns. Unsupported per-platform fields remain unavailable instead of fabricated zeros.
10. **Evidence-backed integration completion:** each connection has stored grant/scope, verified permitted account, last successful sync, mapped real records, disconnect/reconnect path and controlled end-to-end test. Pending app review is displayed as pending, not connected.
11. **Operations:** database restore drill, migrations/rollback, auditable administrative corrections, queue recovery, ingestion/payment/payout alerts, retention/deletion behavior, rate-limit backoff and provider-change monitoring.
12. **Full-product validation:** real fresh-brand onboarding and resume/defer; creator joins and submits authorized test content; operator reviews; real sourced counters generate an auditable earning; sandbox brand charge and payout reconcile; approved ad-account flow creates a controlled object; store report imports provenance; MCP reads tenant data and confirms a bounded mutation. Run responsive/accessibility and loading/empty/error/populated-state review separately.

## 5. Concrete sequencing and readiness reporting

Provision foundation resources and Stripe/email first. Define commercial policy, valid-view/rate controller and role matrix while provider apps undergo registration/review. Then build the brand and creator flows against provisioned services, followed by ingestion/review/ledger, billing/payout reconciliation, ads/store adapters, MCP, and final deployment verification. A missing provider credential should leave that integration explicitly pending while independently authorized work progresses.

Track each feature as **implemented → provisioned → authorized/reviewed → verified in test → enabled live**. Deployment proves hosted code; provisioning proves resources; OAuth proves a customer grant; provider review proves permission; an end-to-end test proves the operational path. A production duplicate is complete only when required paths reach their agreed live readiness state. A new product cannot inherit Noise's creator network, pricing model, advertiser permissions, data licenses, or existing account assets through visual replication.
