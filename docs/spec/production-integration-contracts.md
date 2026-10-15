# Production integration contracts for the Noise-equivalent platform

Prepared October 14, 2026. This supplements `outputs/noise-build-specification.md` and `work/production-requirements.md`. It is a proposed implementation architecture based on the inspected product and current official provider documentation. Noise's private backend and provider grants have not been recovered. No app code, provider resource, credential, payment, ad, or external account was created or changed for this document.

## 1. Provisioning and ownership boundary

The root agent must complete Vercel account authorization, project linking and capability provisioning before app scaffolding. Discover and install the selected persistent database, authentication, payments, email, media, job and observability capabilities; inspect their real environment/API contracts before writing adapters. This document does not select a replacement provider or presume that a listed resource exists.

The new product needs its own stable HTTPS application, OAuth callbacks, webhook URLs, reporting origin and MCP resource URL. Preview and production use separate resources, app registrations/credentials or clearly isolated provider installations. Never reuse Noise's API token, Google service account, OAuth app, or MCP URL. A marketplace installation establishes infrastructure access; each customer's advertiser/store/creator authorization is an additional grant.

Proposed runtime boundaries: request handlers perform authentication, authorization, validation and durable command insertion; jobs perform provider calls; database transactions record business effects and outbox events; hosted provider UIs collect payment/KYC information. Long work is resumable and retryable, with provider rate limits and concurrency controlled per installation.

Vercel Connect is a candidate for supported provider credential custody, refresh and revocation. Confirm the actual connector/catalog and installed capability first. Runtime requests must use the trusted subject and installation belonging to the authorized organization. Project linking does not replace application tenant checks; do not use a connector's default installation to route a multi-tenant request. [Vercel Connect](https://vercel.com/docs/connect)

## 2. Tenant and actor authorization

Every operation starts with a trusted principal. A browser session establishes a user, not an organization chosen by a request parameter. Resolve membership from the database; check the requested organization and permission; fetch the entity using a tenant-qualified key. Apply the same rule to search, downloads, workers, notifications and server-rendered data. A route slug, post URL, external advertiser ID, MCP argument or webhook `org_id` never independently authorizes access.

Proposed initial policy:

| Actor | Allowed scope |
|---|---|
| Brand Member | Permitted workspace reporting and campaign/playbook work; no billing, credential reveal/export or arbitrary membership administration |
| Brand Owner | Workspace administration, brand-owned integration connection/disconnection, reporting-token administration, billing settings and hosted billing-session creation |
| Primary Owner | Owner transfer/offboarding rules in addition to Owner rights; sensitive changes require recent authentication |
| Creator | Own verified social connections, assigned playbooks, own submissions/earnings and own hosted payout onboarding; cannot connect a brand's ad account or see another creator's private records |
| Operator | Explicit operator role and case/organization scope, audited actions; no implicit permission from being a platform employee |
| Worker | Named service capability, installation/entity IDs from authorized durable records; no unrestricted client-supplied target |

Membership/entitlement changes invalidate relevant grants and pending operations. Provider account ownership is a separate check: enumerate assets actually granted to the token, select an authorized account, read it back and store the verified mapping. A user-entered account ID is insufficient. Reusing one external account in multiple organizations requires explicit independent grants; do not silently move its credentials between organizations.

Database requirements include `org_id` on tenant records, tenant-qualified foreign keys, authorization-aware query helpers and database isolation policies where supported. Member/Owner enforcement also runs on the server for plan gates and billing; hiding buttons is not authorization.

## 3. Persistent integration records and readiness

Proposed records, to implement after provisioning:

| Record | Required fields/constraints |
|---|---|
| `integration_installation` | ID, org/creator owner, provider + product surface, environment, connecting actor, external account IDs, selected permitted assets, granted scopes, API version, token type, credential reference, generation, connected/verified/revoked times; never expose credential contents |
| `integration_capability` | Installation, operation (`read_reports`, `read_organic`, `launch_ads`, etc.), application review status, required/granted permissions, asset grant, test result, last success and sanitized failure reason |
| `oauth_attempt` | State digest, actor/session binding, org, provider/product, exact callback, requested scopes, encrypted PKCE verifier when supported, created/expiry/consumed times, return-path allowlist key |
| `credential_version` | Installation/generation, encrypted envelope or managed custody reference, expiry/refresh expiry, key version, rotation metadata; restricted server access |
| `sync_run` / `metric_observation` | Installation, entity/source IDs, report/effective time, fetched time, schema/API version, provenance, data watermark, outcome and raw-payload reference; source-specific deduplication |
| `provider_operation` | Authorized command, canonical parameter hash, idempotency key, external object IDs, stage, attempts and reconciliation state |
| `webhook_inbox` / `outbox` | Environment/provider/account/event ID, verified time, payload reference/hash, processing status and attempt count; unique inbox receipt and unique business-effect keys |
| `api_grant` / `mcp_grant` | Org, subject/client, permissions, hashed token or authorization reference, expiry, revocation, last use and audit reference |

Connection, app approval and freshness are independent. Recommended lifecycle: `not_configured → pending_app_review / awaiting_customer_grant → verifying → connected`; branches include `limited_permissions`, `reauthorization_required`, `revocation_pending`, `disconnected` and `error`. A connected installation can still have stale data or a blocked write capability. The UI states exactly what is missing and which authorized person can remedy it. Do not show “connected” merely because a callback returned or a secret was entered.

Readiness for a capability means: approved application access + sufficient current grant + verified permitted asset + working credential + a successful controlled API call. Ad delivery additionally requires current content authorization and provider approval/status. Show fetched time and source report watermark, not only page-refresh time. Unknown/unavailable metrics are not numeric zero.

## 4. OAuth and credential lifecycle

### Authorization start and callback

1. Authenticate the actor, enforce permission for the target org/product, and require recent authentication for connecting financial or advertiser authority.
2. Generate a cryptographically random, bounded, one-use state; save only its digest, with actor/session/org/provider binding and a proposed ten-minute attempt expiry. Store the PKCE verifier securely and use S256 where the provider supports it. Bind an OIDC nonce when ID tokens participate. Provider-specific code expiry may shorten the attempt.
3. Use a fixed configured callback and authorization host; return destinations are internal allowlisted paths. Do not interpolate arbitrary callback URLs or put secrets/org authority in state.
4. On callback validate state, expiry, provider/issuer context, session and current membership/role. Atomically claim the attempt so concurrent/replayed callbacks cannot exchange it twice. A changed signed-in user or removed Owner fails closed and can restart.
5. Exchange code server-side through the pinned provider adapter. Treat returned scopes as actual grants, independently of requested scopes. Validate token issuer/audience/identity where provided, and enumerate permitted assets before selection. Do not automatically merge application users by matching provider email.
6. Store credentials atomically with installation mapping. If membership is lost or disconnect happens while exchange is pending, prevent the old generation from becoming connected and revoke/discard the new credential.

These are product design requirements grounded in OAuth security guidance and vendor flow requirements; do not add unsupported PKCE parameters to a provider that has not confirmed support. Google supports server-side offline refresh flow, while TikTok's web guide requires a registered static HTTPS redirect and state verification. [OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html), [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [TikTok web authorization](https://developers.tiktok.com/docs/en/login-kit-web)

### Custody, refresh and disconnect

Use managed token custody when the provisioned integration supplies it. Otherwise use envelope encryption for tenant credentials: a fresh data-encryption key and authenticated encryption per envelope, associated data bound to org/installation/provider/generation, with key encryption handled by the provisioned KMS/secret service. Keep encryption keys outside ordinary database rows. Maintain key versions and a rewrap/rotation runbook. Application environment variables hold only server-side platform credentials, never `NEXT_PUBLIC` tenant secrets.

Only credential broker/provider workers can decrypt; ordinary reporting workers receive narrowly scoped access. Redact access/refresh tokens, authorization codes, `.p8` contents, signatures and hosted session URLs from logs and error reporting. UI returns masks/status only; credentials never enter local storage, query strings, public media or analytics events.

Refresh before actual expiry with a safety buffer. One refresh per installation runs under a lock/lease; persist rotating access/refresh tokens using compare-and-swap on generation. An old worker cannot overwrite a newer token. `invalid_grant` or confirmed revocation stops protected calls and prompts reconnect; a transient timeout uses bounded backoff. Do not retry refresh forever or assume a refresh token exists.

Disconnect first disables the local generation and new jobs, invalidates caches and grants, then calls the provider's supported revocation path. Persist `revocation_pending` on remote failure for retry; local disconnection still blocks work. Reconnect creates a new generation. Owner/member offboarding follows the chosen installation-ownership policy; it never silently leaves a former user's personal token as an untracked shared integration.

TikTok organic tokens can return a replacement refresh token, which must replace the stored value; they also support revocation. TikTok Business advertiser tokens and short-term tokens have a separate lifecycle. Do not copy organic Login Kit expiry rules into the advertising adapter. Pin the API version available to the actual approved app and use token metadata rather than assuming every Business token is permanent. [TikTok token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management), [TikTok Business current API reference](https://business-api.tiktok.com/portal/docs/api-reference/v2.0), [TikTok Business authentication FAQ](https://business-api.tiktok.com/gateway/docs/index?doc_id=1766037914914818)

## 5. Provider-specific integration contracts

| Provider/product | Real implementation after provision | External gate and controlled acceptance |
|---|---|---|
| Meta Ads | OAuth/Login for Business flow selected for the product; authorized ad-account/Page/Instagram asset picker; read-report and launch capabilities separate; pinned API; permitted-content launch job with persisted external mapping | Own developer app/secret and registered callbacks; exact permission reviews and business verification required by its app dashboard; customer/business asset grants. Prove an authorized report read and controlled paused/draft ad object where supported. Do not promise delivering ads from API object creation. `ads_management` permission and Marketing API Access Tier are separate concepts. |
| TikTok Ads | Approved Business advertiser authorization, asset selection, authorized reports and idempotent staged launch/reconciliation; separate identity/content authorization records | Business/developer account, app and available API permissions; advertiser consent. Spark Ads require authorized identity/post and authorization status/expiry, separate from advertiser token. Prove one permitted read and authorized controlled launch object. Do not require TikTok One/TTO availability unless that specific integration is approved. |
| TikTok organic | Creator-authorized Display API: stable user ID, `video.list`, ownership check, paginated list/query and available counters; refresh/revoke adapter | Developer app/product review, granted creator scopes. Querying submitted video IDs must prove the videos belong to the authorizing creator. Additional Accounts API use needs its separate access application/permissions. No arbitrary private account scraping. |
| Instagram / Facebook organic | Choose an approved API path and account type; verified account/media association, permitted insights adapter and supported-field registry | Organic permissions and eligible account grants are separate from Meta Ads. Final scope names depend on selected Instagram Login or Facebook Login path and intended fields. Verify against current official app docs during registration; do not combine incompatible scope families or claim consumer-account insights from professional-account APIs. |
| YouTube organic | Public video statistics where available plus OAuth channel ownership verification; authorized channel Analytics when explicitly granted | Own Google project/API access and credentials; applicable consent verification, scope review and quota. Analytics requests require authorization for the channel/content owner; monetary insights need their own scope. An API key/public view counter does not establish channel ownership. |
| Snapchat organic | Approved Public Profile API, stable profile/content IDs, authorized available metrics and separate opt-in capability | App/API access and actual Public Profile permission; richer audience metrics require opt-in/OAuth. Campaign targeting support does not prove metric access. Prove allowed profile/content and counters for one authorized example. |
| App Store Connect | Server credential submission to encrypted custody; actual app/report permission probe; source-dated report request/download/import with role-aware operation gates | Customer provides a new product-specific Issuer ID/Key ID/team `.p8` grant. Sales and Reports is recommended for third-party report processing; requesting a new Analytics report type initially needs Admin. Do not declare success from JWT signing alone. No Customer key is stored in Vercel public env/client bundle. |
| Google Play reports | Product-controlled service-account or verified federated workload identity; invitation instructions showing this product's identity; allowlisted package/bucket mapping; authenticated read, encoding/schema validation, correction-aware imports | Customer invites that service account in Play Console with report permissions. Read a real permitted sample; a bucket name or Google Cloud credential alone is not approval. Prefer per-org isolation or an explicitly tenant-enforced identity/resource mapping. Reports can be delayed; preserve source watermark. |
| Brand billing | Hosted/tokenized payment collection, server-created setup/checkout/portal sessions tied to org customer; off-session threshold charges, subscription/credit ledger and reconciliation | Provisioned Stripe test account first, business activation for live mode, consistent disclosed billing policy and customer consent. Owner-only actions. No raw card storage; confirmed webhook/provider status determines settlement. |
| Creator payouts | Chosen Connect fund-flow model, hosted onboarding, account/capability checks, pending requirements, auditable payout jobs | Connect-enabled platform, supported country/capabilities and creator identity/bank completion. Returned onboarding URL does not prove payout readiness. Platform funding/fees/reserves must be resolved before live settlement. |
| Email/media/AI | Adapters for the actual provisioned email, private storage/processing and model capabilities; invitation tokens, tenant-signed asset delivery and AI draft persistence | Sender DNS/domain verification, resource access, model availability/budget. A real invitation must arrive; assets must be authorization-tested; AI output remains a draft. Provisioning does not supply copyrighted/reference assets or account grants. |

Meta's May 2026 update renamed the access-tier feature to Limited/Full access; it is distinct from `ads_management`. Direct Meta login/permission pages were rate-limited in this research, so the exact new app permission/review checklist must be verified in its official developer dashboard before implementation rather than guessed. [Meta access-tier update](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)

TikTok Business requires an app and advertiser authorization. Spark Ads authorization has its own request/status/grant workflow. Display video query is a different authorized-user API. The Accounts API introduced an additional access application requirement in March 2026. [Business authorization](https://business-api.tiktok.com/gateway/docs/index?doc_id=1738373141733378), [Spark Ads authorization](https://business-api.tiktok.com/portal/docs/get-sparks-ads-authorization/v1.3), [Display video query](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query), [Accounts API access](https://business-api.tiktok.com/gateway/docs/index?doc_id=1737565048641538)

YouTube publicly exposes available video statistics but channel Analytics is authorized and scope-specific. Snapchat distinguishes public discovery from opt-in/OAuth metrics. Availability is field-specific, never an assumed cross-platform metric contract. [YouTube videos](https://developers.google.com/youtube/v3/docs/videos), [YouTube channel ownership query](https://developers.google.com/youtube/v3/docs/channels/list), [YouTube Analytics](https://developers.google.com/youtube/analytics/reference/reports/query), [Snap Public Profile API](https://developers.snap.com/marketing-api/Public-Profile-API/Introduction)

Apple's documented report-role split must be enforced per operation. Google Play reports are private bucket exports using invited report access, can be posted 3–7 days after daily capture, and require compatible CSV decoding. Prefer workload federation over long-lived service-account keys when supported by the provisioned identity path; restrict trust to the actual project/environment/workload. [Apple report roles](https://developer.apple.com/documentation/AppStoreConnectAPI/downloading-analytics-reports), [Google Play reports](https://support.google.com/googleplay/android-developer/answer/6135870?hl=en-EN), [Google service-account security](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)

Neither arbitrary private social metrics nor a network of creators/guaranteed reach is supplied by these APIs. Recruitment, ownership verification, qualifying metrics and content rights need actual participants and permissions. Licensed estimated installs, if included, require a separately provisioned legitimate data source; original Noise vendor use is not a license for this product.

## 6. Billing, webhooks and job idempotency

Billing routes are Owner-only on both request and server action paths. Resolve `org_id → Stripe customer` from stored tenant mapping; ignore client-supplied customer/account IDs. Hosted session return URLs are allowlisted. A Member's direct request gets forbidden; switching an org slug does not expose the other customer portal. Creator Connect links are creator-only for that creator's stored account, not brand Owner links to anyone's bank onboarding.

Keep ledger accounts for creator obligation, campaign spend, cash charge, subscription credits, matching credits, external ad spend and payout settlement separate. Use immutable entries/corrections and unique business-effect keys. Choose, disclose and record the final $5 setup policy, $99 credit policy and matching-credit eligibility before live charging; the conflicting observed product copy cannot define commercial policy automatically.

Webhook ingestion contract:

1. Use separate environment/provider endpoints and bounded raw-body reads. Verify the provider's official signature/authentication procedure before parsing business effects. Never accept a webhook just because a body names a tenant.
2. Stripe uses the raw body, endpoint signing secret and `Stripe-Signature`; verify with its SDK and signature timestamp tolerance. Subscribe only to needed events. Provider retries, duplicates and out-of-order arrivals are expected. [Stripe webhook handling](https://docs.stripe.com/webhooks)
3. Insert an inbox row and durable outbox/job in one transaction; return 2xx only after durable acceptance. Invalid signatures fail. Duplicate verified delivery returns success without repeating effects. An unavailable inbox returns a retriable failure.
4. Resolve tenant from verified environment/provider/account plus stored external-object mapping. Unknown account/object events are quarantined for reconciliation, never routed using untrusted `metadata.org_id` alone. Validate webhook mode/account against the mapped environment.
5. Workers retrieve current provider objects when necessary, authorize the mapped business effect, and use unique payment/invoice/refund/payout/object keys. Do not assume event timestamps define a total order. Inbox receipt deduplication and ledger-effect deduplication are separate.
6. Preserve attempt/error history, exponential backoff, dead-letter alerts and safe replay. Payload retention is bounded and sensitive content encrypted. Replays can reconcile state without charging/paying again.

For TikTok developer webhooks that use its documented `TikTok-Signature`, authenticate the signed timestamp and raw payload with the matching app secret and reject unacceptable replay age. Do not automatically apply that signature scheme to a different TikTok Business webhook surface; verify the chosen provider contract. If a provider has no suitable signed metric webhook, use authenticated polling rather than accepting fabricated events. [TikTok webhook verification](https://developers.tiktok.com/docs/en/webhooks-verification)

Outbound financial commands get a stable idempotency key per immutable business operation. Persist command intent before calling Stripe; reuse its key only for the same parameters. On uncertain timeout, retrieve/reconcile status before creating another charge or payout. Stripe idempotency is one layer; permanent database uniqueness prevents repeats beyond the provider key's retention. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)

Ad launch is a staged saga: verify grant/rights/settings/version → record command → create provider objects in permitted non-delivering state → persist each external ID → validate → require current launch authorization → activate if intended → sync approval/delivery. If an API does not support creation idempotency, an uncertain response enters `reconciliation_required`, not blind recreation. Disconnect, rights expiry or billing block stops future launch stages; partial objects are surfaced for safe operator recovery.

Stripe Connect return redirects are UI navigation, not verification; refresh provider account requirements/capabilities and consume account updates before enabling payout. [Connect-hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding)

## 7. Reporting API and MCP authorization

### Product reporting API

Proposed API: `Authorization: Bearer <product-issued-token>` on a versioned reporting origin. This is the new product's API, not the Noise reporting service. Preserve original report semantics when implemented: UTC windows, created versus active posts, source provenance, period-weighted CPM and deduplicated creators. Exact data comes from the product database, not marketing examples.

An Owner creates a labelled grant for one org with narrow read scopes such as `reports:read`, `campaigns:read` or `creators:read`, optional resource restrictions, expiry and revocation. Generate a high-entropy opaque token, display it once, store a keyed digest plus public lookup prefix, and compare securely. Token issuance/rotation is audited; no recurring “Show plaintext key” endpoint is needed. A presented org header/path can select only an organization already bound to the grant; it never extends permission. Enforce quotas and safe pagination; return 401 for invalid/expired tokens, 403 for insufficient scope, and tenant-safe not-found responses.

Use user-bound OAuth or service credentials tied to an explicit Owner-managed service principal. A removed member's delegated grant stops immediately. Service grant ownership transfer/revocation is deliberate. Reporting keys cannot call billing, publishing or ad launch endpoints. If header compatibility with `x-noise-org`/`x-noise-token` is later required, implement it as an adapter to this same authorization logic using this product's tokens, not a bypass.

### Product MCP service

Serve protected Streamable HTTP at the product's stable MCP URL with protected-resource metadata and an authorization server supporting the selected MCP version and clients. Use standard client-registration/discovery, exact callbacks and audience/resource binding. Validate issuer, audience, signature/introspection, expiry, subject/client and scopes on every HTTP request. Do not put tokens in query strings or accept a provider token as this service's credential. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

Each grant is per client, actor and selected org. Present consent naming the client, org and permissions. Reading an organization requires current membership; mutations additionally require role/entitlement. An `org_` code, if supported for account association, is one-use, short-lived and bound to authenticated intent; knowledge of the code alone cannot authorize an arbitrary tenant or transfer ownership.

Proposed initial tool scopes:

| Scope | Tool family | Boundary |
|---|---|---|
| `reports:read` | Metrics/posts/ads summaries | Authorized org/resource only; no private credential fields |
| `campaigns:read` / `playbooks:read` | List/detail | Return sanitized data and versions |
| `playbooks:draft:write` | Draft instructions, scenes/slides, captions | Proposed revision, validation and persistence; no publish/charge |
| `campaigns:write` | Prepare/update configuration | Role, plan, budget rules and version checks |
| `playbooks:publish` / `ads:launch` | Explicit approved execution | Separate authorization and bound confirmation; no default grant |

Financial actions and credential reveal are excluded from the initial MCP tool surface. If later enabled, they require a deliberate Owner-only scope and confirmation contract, not generic write permission.

Prepare/confirm mutation design: preparation returns a human-readable diff, consequences and an expiring one-use confirmation record bound to actor/client/org/tool, canonical parameters, expected entity version and idempotency key. Commit revalidates permissions, plan, connection generation, rights and entity version. Another client/actor, changed parameters, expired preview or replay cannot execute it. Confirmation must be explicit in the authorized client flow; retrieved content cannot manufacture authority. All executions are audited.

Downstream calls use this server's stored/managed permitted provider grant. Never forward an MCP client's bearer token directly to Meta/TikTok/Apple/Google or issue downstream tokens in a tool result. This avoids the token-passthrough/confused-deputy pattern forbidden by MCP guidance. [MCP security guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)

## 8. Required acceptance tests

| Test | Required result |
|---|---|
| Cross-org entity/connection/search/download attempt | No data/action for the other org, including through jobs and report API |
| Member calls billing/session/token-administration route directly | Forbidden with no hosted session/provider call |
| OAuth wrong state, expired/replayed code, different session/user/provider, changed Owner role | Connection rejected; no credential attached to the wrong org |
| OAuth partial scopes or wrong advertiser/profile selected | Limited/blocked capability; read-back verifies only permitted assets |
| Concurrent rotating refreshes and disconnect during refresh | One current token generation; no resurrected disconnected connection |
| Revoked/expired grant and transient rate limit | Reauth state for permanent grant failure; bounded backoff for transient failure; no fake zeros |
| App review pending but valid sandbox token | Sandbox tests may work; production capability remains pending/blocked |
| Wrong environment/account webhook, invalid signature or old timestamp | Rejected/quarantined with no financial or campaign effect |
| Duplicate and reordered financial webhooks; two events for same object/effect | One durable obligation/settlement effect; provider reconciliation restores state |
| Timeout after external charge/ad-object creation | Reuse/reconcile same operation; no duplicate charge/payout/ad |
| Hosted payment/payout return with unfinished requirements | Pending/action-required state, never falsely paid or payout-ready |
| TikTok video submitted by a different creator; YouTube public ID without ownership verification | Ownership not accepted; no earnings eligibility from unverified association |
| Unsupported private metric or report beyond watermark | Explicit unavailable/partial/stale provenance; no invented reach/location/install values |
| Report token wrong org, expired/revoked, missing scope; removed delegated member | 401/403 or tenant-safe denial; no cross-org read or mutation |
| MCP wrong audience/provider token, scope escalation, changed confirmation params, replay | Rejected; no downstream token passthrough or mutation |
| Secrets in logs/client bundle/public asset/URL inspection | None; redaction and server-only custody verified |
| Real end-to-end authorized connection | Stored real grant + permitted account + successful mapped read + freshness + disconnect/reconnect test |

Provider test accounts and app review access must be granted through their supported process. Only controlled, authorized test operations should be used to validate advertising/settlement; the test suite must not fabricate production activity or launch arbitrary spend.

## 9. What can be built and what remains externally gated

After the real Vercel/resources are provisioned and inspected, implement tenant/session enforcement, persistent integration registry, credential broker, OAuth callbacks, provider adapters, verified webhook inbox/outbox, ingestion/reconciliation workers, hosted billing/payout sessions, reporting API and scoped MCP as real production code. Test deterministic behavior with fixtures plus provider sandbox/authorized accounts. “Not configured” states are genuine readiness states, not evidence that the integration is functional.

Before claiming each integration works in production, obtain its own app credentials/reviews, verified domain/callback configuration, requested customer grants, eligible advertiser/profile/store account and a successful controlled end-to-end test. Email needs sender verification; Apple/Google Play require customer report permissions; Meta/TikTok paid launch needs advertiser and content authority; Connect payouts require creator verification and supported capabilities. Code cannot complete these grants or manufacture creator inventory and reach.

Go-live gates: root provisioning complete; chosen authentication and encryption custody verified; database rollback/restore and durable jobs tested; billing policies resolved; provider-specific reviews/grants recorded; the test table passed; monitoring/revocation/reconciliation runbooks available. Release only capabilities that meet their readiness contract, with remaining providers clearly marked pending their actual external prerequisite.
