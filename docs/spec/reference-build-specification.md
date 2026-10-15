# Noise: build-ready specification and screen map

Prepared October 14, 2026. This handoff combines 38 inspected live interface states, 17 supplied screenshots, and official product/API documentation. The dashboard version shown was v22ac4bf. It separates observed behavior, documented rules, unresolved gaps and proposed implementation.

Core flow: public website -> marketing acquisition -> platform brand onboarding -> organization workspace -> campaign -> playbook -> approved creator posts -> reporting and optional paid ads.

The signed-in account had a paused campaign and draft UGC playbook, no posts/creators, no connected ad account and no payment method. Populated reporting, fresh signup, payment/OAuth and publishing were not exercised. The original Chrome tab was returned to Home.

Use noise-screen-map.html for the browsable reader, noise-screen-inventory.json for machine-readable screens, and evidence/ for original reference images. The private implementation and source stack are not recovered.

## Website and dashboard specification

### Evidence and product structure

Inspected October 14, 2026, through the user's existing Chrome tab, signed into the Testingcreators workspace. The displayed dashboard version was `v22ac4bf`. Thirty-eight live screen and control states were recorded as L01–L38. The account had one paused campaign, one inactive Greenscreen UGC playbook shown as Draft in its editor, zero posts and creators, no connected advertising account, and no payment method. This limits populated-state coverage. No form data was entered, and no Save, Publish, Create campaign, Send Invites, credential, connection, or payment action was submitted.

Use four evidence classes throughout the implementation: **Live** for inspected controls and routes; **Screenshot** for the supplied onboarding captures; **Documented** for official public behavior; and **Proposed** for implementation choices. A live empty state does not establish the layout of populated results. Accessible names can exist in hidden panels; they do not prove the panel is visibly open.

Noise has three primary surfaces: a public marketing website; a brand onboarding wizard; and a brand workspace for campaign operations. The central hierarchy is **organization → campaign → playbook → post**, with creators/social accounts supplying posts. Campaigns hold spend and eligibility settings; playbooks define content instructions and variations. A post may be a Custom Post without an exact playbook match. Ads are an additional workflow that uses organic posts or direct submissions. [Campaign documentation](https://platform.getnoise.com/docs/campaigns)

### Public website

Live homepage L30 adds context to A01. Its header links to Pricing and Creators and opens a Products menu and profile menu. The hero combines a dark particle/resonance visual, frequency readout, creator name/portrait, large headline, and Get started / Talk to Sales links. The name and headline differ from A01: the live capture used Sofia and a viral-hit phrase; the screenshot used Tom and a lifelong-customer phrase. Variation is evidenced; exact rotation timing is unknown.

The page proceeds through brand logos; interactive product previews for playbooks, analytics, posts-to-ads and the AI agent; a five-step workflow; a global creator-network section; integrations; a closing conversion section; and a multi-column footer. The workflow is brief/campaign creation → creator recruitment → management/payment → paid ads → content iteration. Its demos include selectable content types, creator-approval tabs, messaging previews, and flywheel stages. Treat all preview metrics, names, reach claims and creator counts as marketing examples, not verified account results. Clipping and Shopify appear in marketing, but neither was verified as an available current campaign format or dashboard connection.

CTA destinations carry source parameters such as `/start?cta=hero_primary`, `hero_sales`, `pricing_standard`, `pricing_unlimited`, `scale`, `closing`, and `footer`. The live Get started action redirected this existing account to its dashboard (L31). It did not reveal acquisition step 1. Keep that conditional redirect distinct from the screenshot lead modal.

Pricing L29 shows Standard with no monthly platform fee and Unlimited at $99/month, described as minimum spend with the subscription credited toward campaign spend. Standard lists no creator/campaign limits, Meta/TikTok integration, and pay-as-you-go billing. Unlimited lists advanced targeting, CPM/budget controls, dedicated accounts and handpicking creators. Billing labels the account Noise Basic rather than Standard; the name mapping is not verified. [Public pricing](https://platform.getnoise.com/pricing)

### Workspace shell and visual measurements

All ordinary dashboard routes share a left sidebar with brand switcher, collapse control, global search, Home, Live, expanded Campaigns with Organic/Ads, Creators, a Settings group, Resources, and a classic-dashboard link. The main panel scrolls. The editor and campaign creation screens use specialized workspaces instead of the ordinary shell. Messages appears as a floating dock with open-window and side-dock controls.

Observed CSS measurements on Home: expanded sidebar 256 CSS px; navigation rows 32 px high, submenu rows 28 px; typical navigation/button text 14 px; hero heading 36 px/40 px; section heading 20 px/28 px; small links 12 px. The font stack begins `-apple-system, Inter, Inter Fallback, system-ui`. Computed primary text was `#1c1917`, normal sidebar text `#44403c`, muted text `#78716c`, selected navigation fill `#edebe9`; white filled cards were observed. Row radii were 10 px; card-like links 12 px; search 8 px. These are measured CSS values at the inspected browser scale, not a complete token system or responsive specification.

The dashboard uses warm neutral surfaces, thin borders, rounded cards, compact icon/label navigation, sparse empty states with illustrations, and low-emphasis secondary controls. Onboarding uses a separate white shell with orange actions and dark navy text. Public marketing uses a dark, animated-looking hero. Preserve these three surface treatments rather than applying a single theme everywhere.

### Home and Live

Home L01 greets the user, displays last-24-hour and last-60-minute views, and links to Live. Below are date-filtered organic views and ad impressions, active campaigns, and posts. Organic and Ads links carry the selected `from` and `to` dates into their reporting routes. Empty account states explain no views, no active campaigns with earnings, no posts, and missing advertising connections.

Live L09 uses a pale globe showing views from creators' cities in the last 60 minutes, with the two rolling view counters. Its empty-state wording explains that location coverage grows as creators come online. The exact geolocation source, aggregation interval, map technology, and refresh transport were not recovered.

Shared date picker L36 states **all times in UTC** and shows two months. Quick choices are Last 7 Days, Last 30 Days, Last 90 Days, This Month, Last Month, and Year to Date. Actions are Reset to Last 30 Days, Cancel, Apply. The inspected default was September 15–October 14, 2026, labelled 30 days selected. Treat date values as fixtures, not hard-coded defaults.

### Organic reporting

The Organic page has Campaigns, Playbooks, and Posts views with counts (L02–L04). Selecting the campaign name narrowed the view to its playbooks and updated URL state to `tab=playbooks&campaign=20192`. The example campaign ID and playbook ID belong to this account and must not become application constants. Other observed query keys are `tab`, `from`, `to`, and `comparisons=none`; the complete URL-state contract is unknown.

Campaign columns: selection, Active control, Campaign, Views, Spend, CPM, Playbooks, Posts, Creators, Avg Views/post, Budget, Platform. Budget shows currency and Daily, with Edit budget. The accessible name Active is the switch label, not proof that the campaign is active; the create-playbook chooser explicitly called it Paused. Playbook columns: selection, Active control, Playbook, Platforms, Type, Views, Spend, CPM, Posts, Creators, Avg Views/post, Campaign. Edit and Breakdown appeared for the playbook. Both tables expose sortable headings and Previous/Next pagination.

Posts view provides four selectable metric cards, chart comparisons, search, grid/table view, and date-selection mode. Metric options L33: Total Views, Spend, CPM, Posts, Creators, Likes, Comments, Bookmarks, Shares, Engagement %. Filters L34: Campaign, Playbook, Platform, with clear controls. Chart comparison controls also show those dimensions. The chart exposes keyboard movement between days. Mode L35 is Created in range or Active in range; their meanings align with the documented reporting API. No populated post card, post detail/review dialog, or table row was inspected. Bulk Move/Review controls occur in DOM snapshots; their visible selection state and effects remain untested.

### Campaign creation

`/home/{org}/campaigns/new` (L17–L22) is a specialized form with left section navigation, current-value summaries, an Estimates panel, and Create campaign. The action was not submitted.

| Section | Visible contract | Plan or evidence limit |
|---|---|---|
| Campaign details | Campaign Name; Primary Hashtag; recommended hashtag area | Required rules and save errors untested |
| Content | Slideshow or UGC cards | Dedicated is described in docs but was not an option here |
| Budget & Rates | Daily / Manual pricing mode; numeric daily average; slider; weekly average explanation; CPM Cap | Manual and CPM Cap labelled Requires Noise Unlimited |
| Targeting | Countries; Platforms; age range; gender; US metro locations; minimum creator level | Demographics and higher levels labelled Unlimited |
| Approvals | Skip/Require Creator approval; Skip/Require dedicated account creation | Labelled Requires Noise Unlimited |

The form default displayed $500/day and $3,500/week. It explicitly says daily spend is an average, not a cap. The five platform choices are TikTok, YouTube, Instagram, Snapchat, and Facebook Reels. Creator choices are All creators, Silver+, Gold+, Platinum+, Diamond. Country, age, gender, metro, manual-rate, and CTA option catalogs were not exhaustively opened.

Forecasts must be a separate estimate contract. At the unchanged $500/day default, initial and settled estimates differed while the screen loaded; the later capture displayed 4,685,384 monthly views and 17,538 monthly posts. No deterministic rate, confidence interval, inventory model, or input dependency was recovered. Do not infer a pricing formula from the screenshots or these transient figures.

Creator approval controls decide who may enter a campaign. Automatic post-content review decides whether a submitted post earns. These are separate stages. A plan badge signals an entitlement boundary, but server enforcement was not tested.

### Playbook creation and UGC editor

Create Playbook first opens a dialog asking which campaign the playbook belongs to (L23). It lists Testingcreators (Paused), plus Cancel and disabled Continue until a choice. No new playbook was created; following stages were not inspected from this entry point.

Existing editor route: `/home/{org}/playbooks/{id}/edit` (L05–L07). Its header contains Playbooks back link, editable playbook name, Draft label, Publish, and Hashtags & Descriptions. Side controls include a unique-script count with See the math, Templates, Noise agent, References, numbered scene cards, delete controls, and New scene. Template and agent panes were not opened.

The main editor contains reference-video tiles/Add video, general instructions/Add, ordered scenes, and a creator-app preview. Each scene has a name, instruction textarea, zero or more on-screen text options, Add text and remove controls. The existing Greenscreen draft had two scenes: filming a background/screen recording and filming a green-screen take. These are sample instructions, not universally required scenes. Reference count initially loaded as zero and later as one without an edit; distinguish loading from stable state.

Descriptions/hashtags opens a panel with multiple description textareas, add/remove controls, hashtag chips/removal, Add hashtag input, Close, and Save. One description is picked per creator; hashtags are appended. The inspected draft had two description choices. Its math panel counted one script × each scene's on-screen text options × two descriptions = two unique scripts; a scene with no on-screen text contributed a factor of one. This verifies this example, not every format's combinatorics.

Publishing, autosave/persistence, revision history, media upload, reference validation, and creator-side matching were not tested. Official slideshow instructions describe image/text choices per slide, media groups, post descriptions, and a Custom Posts matching fallback, but show older/different editor labels. Keep them as format behavior evidence, not current pixel-level UI truth. [Slideshow guide](https://platform.getnoise.com/docs/guides/make-a-slideshow-playbook)

### Ads and advertising defaults

Ads L08 has All ads and Submissions tabs, date range, and Create ads. With no connection, All ads asks for a Meta/TikTok account. Submissions L37 explains that direct creator video/image submissions appear there and showed none. Create ads L38 uses a specialized page and stops at an integration prerequisite. Launch destination selection, ad-account/ad-set/ad-group controls, rights/authorization, upload, approval, ad status and populated reporting are unobserved.

Ad settings L11/L26–L28 are four tabs with shared Save (disabled before changes):

- Copy templates: body-copy options and Add template; token replacement per post is described.
- Naming conventions: configurable custom fields; Date, Creator, Separator; drag order; preview template and example. Every generated name ends in Noise ID. The observed example was `Noise_<creator>_<Noise ID>`; individual ad names may override it.
- Links & parameters: Website URL and URL parameter list/Add parameter. Values can use `{{platform}}` (meta or tiktok) and Meta macros such as `{{adset.id}}`.
- Default CTA: separate Meta and TikTok selectors; choices were not opened.

These are defaults for new ad launches, not evidence that changing settings rewrites existing ads.

### Creators, Branding, Members and Messaging

Creators L10 has All your creators / Removed, Most Views / Most Viral / Most Engaging summaries, creator search, Campaign / Creator Level / Platform filters, and a sortable table. Columns are Creator, Level, Posts, Views, Likes, Comments, Platforms, Accounts, Posting activity, plus selection. Empty copy explains published playbooks are shown in the creator app. Creator detail, removal/restoration, selection actions and populated heatmaps were not inspected.

Branding L12 has Name; Brand Hashtag; three categories; logo and cover upload; color; a rich description; Website/App Store/Android App links; and a live brand-page preview. Logo guidance: at least 256×256 PNG/JPG; cover: at least 800×800 PNG/JPG. Description limit is 1,000 characters, with heading/subheading/bold/italic/underline/lists/link/undo/redo controls. Category 1 showed Sports. The preview displayed sample rates, creator-level gates, and posting controls; these preview values do not establish campaign economics. Save was disabled before changes. Leave Team is a separate consequential action in a Danger zone and was not activated.

Members L14 separates Team Members and Pending Invites, with independent searches and pagination. Member columns: Name, Email, Role, Joined at. Invite columns: Email, Role, Invited at, Expires at, Status. The current user showed Owner and Primary Owner. Invite dialog L32 has Email, Add another one, Remove invite, Send Invites, and Close; although its helper mentions role, no role picker was visible in the captured initial dialog. Docs supply Owner/Member rules, not a fully observed per-role UI.

Global search L24 is a command-style dialog for campaigns, playbooks, posts, creators and pages. It advertises ⌘K, arrow navigation and Enter to open. Windows shortcut behavior, ranking and result layout were not tested.

The floating Messages dock and hidden DOM panels expose Noise Agent, Noise Team, channel search, minimize, pop-out and side-dock. Creator messaging is labelled included with Unlimited. No message was sent. DOM presence alone does not show the visible dock state or message delivery behavior. Resources L25 links docs, guides, newsletter, onboarding webinar, podcasts and social accounts; it also exposes the classic dashboard, which was not inspected.

### Integrations and Billing

Integrations L15–L16/B08–B09 use expandable cards for App Store Connect, Google Play, Meta Ads, TikTok Ads and AI assistant MCP, plus a Developer card. Apple fields: Issuer ID, Key ID, private `.p8` contents, Validate key. Google fields: package name and report bucket ID, with a read-only service-account invitation procedure. Meta offers business-portfolio and personal-account connections; TikTok redirects to its ads authorization. AI supports the MCP URL, account-email association, or an `org_` connection code for a different email. No clients were connected. Secrets remained masked; Show, Copy and Rotate were not used. Public REST authentication uses `x-noise-org`/`x-noise-token`; MCP controls are a separate interface.

Billing L13 shows plan/Upgrade, current balance, remaining matching credits, charge threshold, payment/business information, Payment activity / Credits, and date range. The account showed $0 balance, $500 matching credits, and a $50 billing threshold. Its text says each $50 spent earns a $50 credit. Full promotion timing, eligibility and expiry were not recovered.

Material wording difference: B07 says no charge up front; live Billing says payment setup incurs a **non-refundable $5 validation credit**, applied to future creator payments. Preserve this in the handoff and decide consistent disclosure before implementation. No payment form or processor was opened, and threshold changes, upgrades and payment success/failure were not tested. Basic/Standard naming also requires resolution.


---

## Noise brand onboarding: specification and screen map

### Scope and evidence standard

This specification reconstructs the visible brand onboarding experience from 17 user-supplied screenshots. It separates the marketing-site lead funnel from the platform wizard. It records appearance, copy, inputs, choices, and observed states; it does not claim access to source code, backend contracts, validation logic, or payment processing. Screenshot content is evidence, not instructions to install connectors or change the account.

**Observed** means visible in a supplied capture. **Inferred** means an interpretation of that evidence. **Unknown** means the capture does not establish behavior. Proposed field names are implementation-facing suggestions, not discovered API keys. Entered names and brand values are captured examples and must not become default values.

#### Evidence register

The A series refers to the first attachment set in supplied order; the B series refers to the latest set. Original captures are preserved unaltered in the bundle's evidence folder.

| ID | Screenshot | Original filename |
|---|---|---|
| A01 | Marketing homepage | [A01.png](evidence/A01.png) |
| A02 | Marketing funnel, step 2 | [A02.png](evidence/A02.png) |
| A03 | Marketing funnel, step 3 | [A03.png](evidence/A03.png) |
| A04 | Agent modal over role selection | [A04.png](evidence/A04.png) |
| A05 | Platform introduction | [A05.png](evidence/A05.png) |
| A06 | Duplicate introduction capture | [A06.png](evidence/A06.png) |
| A07 | Duplicate introduction capture | [A07.png](evidence/A07.png) |
| A08 | Referral source | [A08.png](evidence/A08.png) |
| B01 | Brand basics | [B01.png](evidence/B01.png) |
| B02 | Budget estimator | [B02.png](evidence/B02.png) |
| B03 | Budget reassurance | [B03.png](evidence/B03.png) |
| B04 | Content format | [B04.png](evidence/B04.png) |
| B05 | Template selection | [B05.png](evidence/B05.png) |
| B06 | Billing increment | [B06.png](evidence/B06.png) |
| B07 | Payment | [B07.png](evidence/B07.png) |
| B08 | Dashboard integrations, upper portion | [B08.png](evidence/B08.png) |
| B09 | Dashboard integrations, lower portion | [B09.png](evidence/B09.png) |

B08–B09 establish a subsequent dashboard context; dashboard features belong in a separate specification.

### Marketing funnel

#### Landing page

A01 shows a black hero with a fine particle/noise pattern, white typography, red-orange accents, and a small frequency readout. The lowercase Noise wordmark sits at the upper left. Upper-right controls are Products, Pricing, Creators, and avatar A. The hero reads “Your new lifelong customer starts with a creator named” followed by a circular portrait and “Tom.” The eyebrow is “THE APP STORE’S MOST-DOWNLOADED CREATOR MARKETPLACE.” Treat that as displayed marketing copy, not verified market evidence. CTAs are “Get started ↗” and “Talk to Sales ↗.”

The underlying hero and frequency readout differ across captures. Animation and rotating copy are plausible but unconfirmed; the full set of variants and timing are unknown.

#### Lead modal: step 2 of 3

A02 labels the screen “STEP 2 OF 3” and “Tell us about your brand.” It uses a white rounded modal, dark overlay, upper-right close control, internal vertical scrolling, and full-width orange Continue button. The modal is approximately 600 px wide in this capture; browser scale and responsive rules are unknown. Step 1 is absent.

| Proposed key | Visible label/type | Captured content or options |
|---|---|---|
| `firstName` | First name, text | Annie is entered and selected |
| `lastName` | Last name, text | Diaz appears in muted text; placeholder versus value is uncertain |
| `phone` | Phone number, text | “Enter your phone number” |
| `companyName` | Company name, text | “Your brand” |
| `companyWebsite` | Company website, text | “yourbrand.com” |
| `marketingBudgetBand` | Monthly marketing budget, single-choice pills | $0 – $50K; $50K – $100K; $100K – $250K; $250K+ |
| `jobLevel` | Job level, dropdown | “Select a job level”; options unknown |
| `jobFunction` | Job function, dropdown | “Select a job function”; options unknown |
| `notes` | Anything else? (optional), textarea | “Tell us more about your project, needs, and timeline” |

First/last name and job level/function occupy paired half-width columns. Other fields span the modal. Only notes are explicitly labelled optional. No errors, submission response, phone rules, URL rules, or required-field indicators are shown. Store budget bands as exact categorical choices until numeric boundary treatment is confirmed.

#### Routing modal: step 3 of 3

A03 displays “Choose how to start” and “Based on what you told us, here is where we would take you next.” Two large bordered cards offer:

- **Self-serve sign up:** “Create your account, build a playbook and go live today.”
- **Read how Noise works:** “Five steps from brief to Paid Ads.”

A close control and “← Back” are visible. The selected route, destination URLs, qualification logic, and account-creation screen are unknown. These captures do not prove that every lead sees the same choices or that either card automatically opens the platform wizard.

### Platform wizard

#### Shared shell and appearance

A04–B07 use a white page with dark navy/black text, muted blue-gray secondary text, and pale blue-gray input borders. A green outlined banner persists above the header:

“Get up to $500 in credits when you start”

“We’ll match your spend, dollar for dollar, up to $500.”

The header contains the Noise logo, “Onboard with your agent,” and “Questions?”, followed by a thin divider. Main content is centered with substantial whitespace. Forms are typically 480–700 px wide in the captures; example-card rows are wider. Screens use different apparent scale, so those dimensions are guidance, not verified CSS tokens.

A bottom region contains an **11-segment** progress indicator, Back at left where shown, and Next/Finish at right. Filled segments are dark; remaining segments are very pale. Introductory Get Started is red-orange; later Next buttons are dark; disabled buttons are gray. Selection is expressed through stronger outlines and sometimes pale fill. Some captures include a page scrollbar; sticky positioning and breakpoint behavior remain unknown.

#### Observed screen map

Positions are counted from filled progress segments, not textual step labels. The sequence is a reconstruction of the supplied captures; it is not a verified end-to-end journey.

| Position | Screen and evidence | Inputs/actions and visible state |
|---|---|---|
| 1 | Role selection, A04 | Two-column card grid partly covered by modal; Next disabled |
| 2 | Introduction, A05–A07 | Three explanation rows; Get Started |
| 3 | Referral, A08 | Seven radio-style choices; Next disabled |
| 4 | Brand basics, B01 | Three text fields; description blank; Next disabled |
| 5 | Not supplied | Title, fields, copy, and behavior unknown |
| 6 | Budget estimate, B02 | Daily-budget slider; Next enabled |
| 7 | Reassurance, B03 | Illustration and estimate confirmation; Next enabled |
| 8 | Format, B04 | Slideshow and UGC cards; Slideshow apparently selected |
| 9 | Template, B05 | Five example cards; Greenscreen apparently selected |
| 10 | Billing, B06 | $10/$25/$50 cards; $50 apparently selected |
| 11 | Payment, B07 | Add payment method; defer link; Finish disabled |

#### 1–4: Identity, orientation, acquisition source, and brand

The role screen is partially obscured in A04. Visible choices are **Founder**, **Creator**, **Operations**, and **Other**. Two other card labels are hidden. The title begins “What best desc…” and the subtitle is also partially covered. Do not supply guessed labels or completed copy.

A05–A07 say “It’s easy to get started on Noise” and present numbered rows with pale emoji squares:

1. **Tell us about your brand:** “Share the basics of your brand and what your goals are”
2. **Set your budget:** “Define your budget to help us tailor the experience”
3. **Publish your first playbook:** “Once you publish, creators will start posting your content across social media”

A08 asks “Where did you hear about Noise?” with “Let us know what’s working.” Choices are **Google Search**, **Social Media**, **Podcast**, **YouTube**, **TikTok**, **I have a code**, and **Other**. Additional fields after choosing code or Other are unknown.

B01 says “Tell us about your brand.” Fields are:

- **Brand Name:** captured value Test.
- **Your website:** captured value test.com. Helper: “Don’t have one? An App Store link is also ok!”
- **Brand Description:** helper “A short description helps us recommend better content and templates for your brand”; placeholder “e.g., ‘Pip’s Pops is a direct to consumer soda brand’”.

#### 6–7: Budget estimate and reassurance

B02 displays “Testingcreators can get **20,000,000** views on TikTok this month..”, a secondary estimated **8,333 creators**, and “**$1,000 daily budget**.” Views have an orange highlight; creator count has a dark pill. The orange slider handle is near the right end. The minimum, maximum, increment, default, and response curve are unknown.

A bordered note says “You only pay for the views you get, when you get them. We never charge your full budget upfront.” This is visible product copy; actual billing eligibility and view verification are not established.

B03 uses a colorful flat group illustration and says “Sweet! 20.0 million views is very achievable!” followed by “It’s all about content: set up your first playbook so creators can post about you!” Treat the estimate as a projection, not a guaranteed outcome.

**Arithmetic inference only:** assuming 30 days, $1,000/day implies $30,000/month. At 20 million projected views, this gives $1.50 per 1,000 views. The displayed creator estimate implies approximately 2,400 views and $3.60 of budget per creator. Those calculations do not establish fees, payouts, creator supply, or a reusable estimator formula. One slider point is insufficient to reverse engineer the curve.

#### 8–9: Format and template

B04’s screen title is not visible. Its subtitle says “Real examples from campaigns running right now. You can always change this later.” Portrait cards offer:

- **Slideshow:** “The fastest way to reach viewers, and the best way to test new formats.”
- **UGC:** “Creators show faces on camera to promote your brand.”

Slideshow has the stronger outline, suggesting selection. B05 says “Start from a template,” “Recommended for your brand,” and “You can access these inside the builder.” Five portrait cards are labelled **Greenscreen**, **Draft - Hook & demo**, **Talking head - Skincare**, **Skit - Energy Drinks**, and **Stitch - Side Hustle**. Greenscreen has an orange outline.

**Capture mismatch:** the apparent Slideshow choice is followed by UGC-style templates. The user may have changed selections or supplied different runs. Do not infer format-specific template filtering, automatic conversion, or preserved selection from this pair.

#### 10–11: Billing and payment

B06 asks “How often do you want to be charged?” and explains “We bill in increments as creators earn for you. Pick whatever cadence feels right — you can change this any time.” Cards offer:

- **$10:** “Get charged in small, frequent amounts”
- **$25:** “A balanced cadence for most brands”
- **$50:** “Fewer, larger charges. Less paperwork”

$50 has a dark outline and pale fill. These are monetary charge thresholds; no time schedule is shown.

B07 says “You’re almost there” and “Add a payment method to put your playbook live.” A blue/teal bordered card contains Payment Details, a Final step badge, “We’ll charge in $50 increments as creators earn for you,” and “Add a card to put your playbook live. You’re only charged as creators earn for you, nothing up front.” Actions are **Add payment method**, **I’ll finish later**, and disabled **Finish**. The payment form, processor, success state, and defer destination are absent.

### Proposed platform field contract and validation limits

| Proposed key | Type/visible domain | Evidence and limitation |
|---|---|---|
| `role` | Single-choice string | Four labels known; two hidden, A04 |
| `referralSource` | Single-choice enum | Seven exact labels above, A08 |
| `brandName` | String | Test is example input, B01 |
| `brandWebsite` | String | Domain and App Store links are described, B01 |
| `brandDescription` | String | Blank capture; limits unknown, B01 |
| `dailyBudget` | Numeric currency amount | Only $1,000 observed, B02 |
| `contentFormat` | Slideshow or UGC | Apparent selection inferred from outline, B04 |
| `templateLabel` | Selected template reference | Five visible labels; IDs unknown, B05 |
| `billingIncrement` | 10, 25, or 50 USD | $50 apparently selected, B06–B07 |
| `paymentReady` | Payment status | Disabled Finish without shown payment, B07 |

No field contract can be assigned to missing position 5. Do not collect payment details in ordinary onboarding state; integration requirements await direct evidence. Input length limits, normalization, defaults, server validation, persistence, resume behavior, and Back-state retention are unknown. Disabled Next on referral and brand screens suggests incomplete input validation, but no capture isolates the exact condition. No error-state wording is available.

### Agent modal and outstanding gaps

A04’s modal says “Add the Noise Agent” and “Turn your ideas, or something you’ve seen before, into a slideshow or UGC script creators will post.” Tabs are **For Claude**, **For ChatGPT**, and **For Gemini**; Claude is selected. A copyable block labelled “Paste this into Claude” shows `https://reporting.getnoise.com/mcp`. An expanded “Steps to connect” section instructs users to open Claude Settings → Connectors, add a custom connector with the URL, and sign in using the desired Noise account email. “Read the full connect guide” and close controls are visible. Other tabs, copy feedback, guide destinations, and authentication outcomes are unobserved.

Before production behavior is matched, resolve: acquisition step 1 and dropdown contents; both hidden role labels; missing platform position 5; validation/error states; slider range and multiple estimator samples; referral conditional fields; template filtering; payment form and completion; defer behavior; responsive layouts; session persistence; and the transition into the playbook builder/dashboard. Brand Test versus Testingcreators is another capture difference, not an established naming transformation.


---

## Noise: API and campaign domain specification

**Evidence:** visible official documentation captured on October 14, 2026, in `reporting-api-dom.txt`, `campaigns-doc-dom.txt`, `team-roles-doc-dom.txt`, and `slideshow-guide-dom.txt`; current unsubmitted campaign/UGC editor inspection; and the supplied onboarding budget screenshot. This documents exposed behavior, not internal code, tables, or pricing algorithms. No authenticated API requests were made. Where current UI and documentation differ, retain both with their scope identified.

### 1. Documented reporting interface

Base URL: `https://reporting.getnoise.com`. Reporting REST access is **read-only**. Every request requires organization header `x-noise-org` and secret header `x-noise-token`; the dashboard exposes credential management under Settings → Integrations. The public OpenAPI document is advertised at `https://reporting.getnoise.com/openapi.yaml`, but its contents were not inspected for this specification. The MCP connection URL is `https://reporting.getnoise.com/mcp`; do not infer REST mutation endpoints from the existence of MCP campaign controls. [Reporting API documentation](https://platform.getnoise.com/docs/reporting-api)

| Method and path | Purpose | Request contract |
|---|---|---|
| `GET /v1/reports/daily` | Daily metric rows and period totals | Required `start_date`, `end_date`; optional `group_by`, `campaign_id`, `playbook_id`, `metrics` |
| `GET /v1/posts` | Paginated post drilldown | Required dates; optional `mode`, campaign/playbook filters, pagination, sorting |
| `GET /v1/campaigns` | Campaign filter choices | Returns campaign `id`, `name`, `active`; additional parameters are not documented here |
| `GET /v1/playbooks` | Playbook filter choices | Returns playbook `id`, `name`, `active`; additional parameters are not documented here |

Both date-based endpoints accept `YYYY-MM-DD`, interpreted in UTC, for a range of at most 366 days. Date-boundary inclusivity and the behavior of missing-data days are not explicitly described. Data freshness is approximately five minutes. Organization rate limits exist and responses expose `X-RateLimit-*` headers; numeric limits, errors, retry behavior, and header names beyond that prefix were not recovered. [Reporting API documentation](https://platform.getnoise.com/docs/reporting-api)

#### Daily reports

Date is always a grouping dimension. `group_by` accepts a comma-separated selection of `campaign`, `playbook`, or both. Additional grouping adds the relevant IDs and names to rows. `playbook_id: 0` means Custom Posts. `metrics` selects a subset; omission requests all. The documentation does not establish whether the daily endpoint accepts comma-separated filter IDs.

Response contains `meta`, `totals`, and `data`. Metadata includes requested dates, grouping, UTC timezone, row count, and freshness. Each data row has `date`, requested available metrics, and requested grouping identifiers. The docs show no pagination parameters for this endpoint. [Reporting API documentation](https://platform.getnoise.com/docs/reporting-api)

#### Post drilldown

`mode=created` is the default: select posts created in the date range. `mode=active` selects posts that gained views within it, regardless of post age. Campaign and playbook filters accept comma-separated IDs with OR semantics inside each filter. Omitting `campaign_id` includes campaigns but excludes posts without campaign attribution; include ID `0` to request unattributed posts. Playbook ID `0` includes Custom Posts and can be combined with other IDs.

`page` defaults to 1. `page_size` defaults to 25 and has maximum 100. `sort` defaults to `posted`; alternatives are `views`, `range_views`, `likes`, `comments`, `bookmarks`, `shares`, `spend`, `engagement`, and `handle`. `order` accepts `asc` or `desc`; its default is not expressly stated. Metadata exposes page, page size, total matches, returned row count, sort, order, UTC timezone, and freshness.

Post fields illustrated by the documentation: `content_id`, `user_id`, `campaign_id`, `playbook_id`, `playbook_name`, `platform`, `handle`, `code`, nullable `avatar_url`, `posted_at`, `range_views`, `views`, `likes`, `comments`, `bookmarks`, `shares`, `engagement_rate`, `spend`, `image`, and `url`. Do not assume undocumented fields are mandatory or invent a meaning for `code`. [Reporting API documentation](https://platform.getnoise.com/docs/reporting-api)

### 2. Metric semantics and display rules

| Metric | Documented meaning | Implementation implication |
|---|---|---|
| `spend` | Brand cost in USD | Keep money precision; report cost separately from creator payouts |
| Daily `views` | Views earned that day, incremental | Sum daily increments for range views |
| `posts` | Approved posts | Do not label this as all submitted posts |
| `creators` | Unique creators | Avoid summing daily creator counts to imply range-unique creators |
| `cpm` | Spend ÷ views × 1,000 | Recompute aggregate CPM from aggregate spend and views; do not average row CPM |
| Post `range_views` | Views gained within requested range | Distinguish from the post’s lifetime `views` |
| Post engagement | Lifetime interactions ÷ lifetime views, fraction 0–1 | Multiply by 100 only for percentage display |

Lifetime engagement uses likes + comments + bookmarks + shares. Post statistics are lifetime except `range_views`. `posted_at` is ISO 8601 UTC and may be rendered in the viewer’s timezone. API days remain UTC even when timestamps are displayed locally. Spend and views have independent dating, making daily CPM noisier than period CPM. The documentation does not specify zero-view division behavior or post-spend lifetime/range scope clearly enough to implement by assumption. [Reporting API documentation](https://platform.getnoise.com/docs/reporting-api)

#### Install sources

`estimated_installs` is a blended best-available **organization-wide** daily series: connected App Store/Google Play first-party reports take precedence for the covered platform/dates, with third-party SensorTower estimates filling uncovered dates when available. Despite its name, it can contain store actuals. `totals.installs_source` identifies `store`, `estimated`, or `mixed` contribution.

`installs_by_source` preserves independent raw series: `app_store`, `play_store`, and `noise`. The `noise` estimate is overall, never split by platform. These series can overlap; **their sum is not the blended install value**. Missing keys mean that source reported nothing, not necessarily zero. An empty object means no source reported. Additional source keys may appear later.

Install fields appear only at day grain when an install source exists; they are absent from campaign/playbook-grouped reports. UI must distinguish unavailable from zero, label actual/estimated/mixed data, and prevent campaign-level install attribution claims. The exact blending logic when only one platform reports is not fully specified. [Reporting API documentation](https://platform.getnoise.com/docs/reporting-api)

### 3. Documented campaign behavior

A campaign controls creator access, payment, and budget; attached playbooks specify content instructions. Slideshow accepts Bronze-level creators and above. UGC requires Gold level or above and verified niche-focused social accounts. Dedicated requires Gold level or above with dedicated accounts and invitation access unlocked through the Noise team. Creator levels reflect approved content and performance, but thresholds were not recovered. [Campaign documentation](https://platform.getnoise.com/docs/campaigns)

| Pricing mode | Budget | Rates and constraints |
|---|---|---|
| Dynamic, default for new campaigns | Daily target; minimum $50 | Noise continuously prices creator payouts. Learning-phase daily spend may exceed target; documented expectation is averaging to target over a week. Dashboard compares actual seven-day average spend with target. No controller formula was recovered. |
| Fixed, legacy option | Total budget per recurring 30-day period | Brand configures CPM by country/platform and maximum payout per post. Spending stops at exhaustion; budget renews each period. Editor shows spent amount/reset date and permits manual budget-window reset. More specific country + platform rates outrank general country rates. |

Only approved content earns payment. The docs describe automatic review against campaign requirements for all posts and direct brands to contact Noise for different arrangements. The current form exposes approval-related controls gated by Unlimited; their persisted behavior was not tested. Valid-view qualification details were not recovered. [Campaign documentation](https://platform.getnoise.com/docs/campaigns)

Campaigns begin inactive. Activation makes them visible to creators. Pausing stops spending and earning for **all** posts, including posts made before the pause. Treatment of views accrued during a pause after later reactivation is not documented. Editable settings include name, primary hashtag, creator type, and budget. Primary hashtag is campaign-unique and required in posts for matching. Optional maximum creators is unlimited when empty. The docs mention country targeting and TikTok/Instagram and say dynamic targeting changes are handled by the team. Duplication creates a starting point from an existing campaign; exact fields copied were not recovered. [Campaign documentation](https://platform.getnoise.com/docs/campaigns)

#### Current UI versus documentation

The inspected **new-campaign form** offers targeting platforms **TikTok, YouTube, Instagram, Snapchat, and Facebook Reels**. Its mode labels are **Daily** and **Manual**; Manual requires **Noise Unlimited**. Daily/manual appears conceptually related to documented dynamic/fixed pricing, but that mapping was not verified through submitted payloads. The form also shows demography, creator levels **All creators / Silver+ / Gold+ / Platinum+ / Diamond**, and **CPM Cap**; approvals and dedicated-account requirements are gated by Unlimited.

Implement the observed choices in a faithful current UI specification. Do not restrict its platform menu to the two platforms named in the docs or equate selectable level filters with the documented eligibility rules. Editable filters in an unsubmitted form and team-managed targeting changes on saved dynamic campaigns may concern different stages, plans, or product versions; persistence/enforcement remains unverified. Likewise, Unlimited approval controls and invitation access for Dedicated are distinct observed/documented gates, not proven interchangeable.

#### Playbook guide scope

The slideshow guide documents ordered slides, choosing one image and one caption option randomly per slide, separate post-description options, and sampling **2–3 playbook hashtags plus the primary campaign hashtag**. It uses **Save → Setup & Activate**, apparently an older or different editor flow. The currently inspected UGC editor uses **Publish** and says its hashtags end every post. These differ by format and possibly version: do not apply slideshow sampling to UGC or use guide screenshots as current pixel truth. The guide also attributes caption deviations, even spacing changes, to Custom Posts; exact matching behavior in the current editor was not tested. [Slideshow guide](https://platform.getnoise.com/docs/guides/make-a-slideshow-playbook)

### 4. Documented roles and access lifecycle

**Owner** has full control of campaigns, playbooks, creators, billing, workspace settings, and team management. **Member** has more limited access and does not control campaigns or billing; a complete member permission matrix is not documented. Only the **primary owner**, initially the account creator, may transfer ownership. Owners may change roles/remove teammates only below their own role level. Billing is owner-only, including viewing or changing payment methods, invoices, and billing settings. Custom individual permissions require Noise assistance. [Team & Roles](https://platform.getnoise.com/docs/team-and-roles)

Invitations use email and chosen role, remain pending until accepted, and support renewal after expiration or revocation. Removal immediately revokes account access and preserves content the person created. There is **one shared reporting API key per organization**, while each teammate can connect an AI client. Removal does **not** rotate that key or disconnect linked clients; documented offboarding requires separately rotating the key and removing the departing person's AI clients in Integrations. Clients identify who connected them. Preserve this observed behavior in the specification; automatically revoking derived credentials would be a separately identified implementation improvement. [Team & Roles](https://platform.getnoise.com/docs/team-and-roles)

#### Onboarding estimator uncertainty

The supplied screenshot shows **$1,000 daily budget → 20,000,000 monthly TikTok views → estimated 8,333 creators**. No estimator formula, forecast period, view validity rule, or confidence interval was recovered. Assuming 30 days purely for arithmetic gives $30,000 ÷ 20,000,000 × 1,000 = **$1.50 implied CPM**, and roughly **2,400 views per estimated creator**. These are arithmetic implications, not verified Noise pricing or achievable outcomes. Implement a separately identified forecast service only after its inputs and assumptions are decided; do not hard-code this screenshot as a guaranteed result.

### 5. Proposed implementation data model

**Design proposal, not a recovered Noise database schema.** Use organization tenancy and immutable financial events; keep operational settings separate from reporting projections.

| Entity | Suggested fields and relationships |
|---|---|
| Organization / Membership / Invitation | ID, unique slug, brand profile, primary owner; Owner/Member roles, optional custom grants; invite email, role, pending/accepted/expired/revoked status |
| Campaign | Organization ID, name, unique primary hashtag, creator type, pricing mode, inactive/active/paused status, nullable creator cap, daily target or period budget |
| CampaignTarget / FixedRate | Campaign, country, platform, CPM, specificity; post payout cap; dynamic targeting under managed control |
| BudgetWindow | Campaign, start/end, allocated amount, spent amount, reset reason; 30-day fixed periods |
| Playbook / CampaignPlaybook | Organization, format, versioned content and instructions, active status; campaign attachment relationship |
| Creator / SocialAccount | Creator level; account platform, handle, verification, niche/dedicated classification |
| CampaignMembership | Campaign and creator/account, eligibility evidence, join status/time |
| Post / Review | Account, campaign, nullable playbook, external URL/ID, posted time; submitted/approved/rejected review state and audit trail |
| MetricObservation | Post, observation time, lifetime counters; derived daily increments with correction handling |
| EarningEvent / SpendEvent | Post, campaign, UTC date/time, valid-view basis, pricing snapshot, monetary amount, idempotency key |
| InstallObservation | Organization, date, source, nullable platform, raw installs, provenance; separate blended daily projection |
| Integration / AIClient / ReportingCredential | Organization, provider, status, connecting member; encrypted secret reference or hashed token metadata, one shared org reporting key, permissions, rotation/revocation history |

Keep Custom Posts and unattributed campaigns as explicit internal null/category states; translate to reporting sentinel `0` at the boundary. Persist forecast assumptions separately from budgets. Mutation commands should enforce role permissions, eligibility, current campaign status, review approval, and budget availability server-side. MCP mutations should use preview/confirmation only if independently verified for the product being built; this REST evidence establishes no mutation contract.

Acceptance checks: filter created versus active posts correctly; paginate and sort server-side; exclude unattributed posts unless requested; recompute weighted CPM; omit installs from grouped results; preserve missing-source semantics; prohibit paused/unapproved earnings; apply specific fixed rates first; stop fixed spending at budget exhaustion; and retain an audit record when resetting windows. Confirm unresolved rounding, reversal, view-quality, concurrency, forecast, and reactivation policies before production implementation.


---

## Implementation handoff

### Delivery scope and evidence boundaries

This is a build specification and screen map, not a local replica or recovered source repository. The Chrome session supplied live route/control evidence; 17 original screenshots supplied onboarding and integration visuals; official docs supplied business rules and REST contracts. Backend code, database implementation, pricing controller, payment webhooks, OAuth internals, account permissions enforcement and responsive behavior were not recovered.

The deliverables are a portable visual reader, an editable Markdown specification, a JSON inventory, and preserved image/DOM evidence. Screen and flow IDs refer to the same inventory. Proposed entities, component names, state machines and work sequence below are implementation choices.

### Proposed component and state model

Reusable components: WorkspaceShell, Sidebar/BrandSwitcher, GlobalSearchDialog, MessageDock, UtcDateRangePicker, MetricCard/MetricSelector, DailyChart/ComparisonControls, FilterPopover, SortablePaginatedTable, EmptyState, PlanGate, OnboardingShell/ProgressSegments, ChoiceCard, CampaignEditorShell, PlaybookEditorShell, SceneEditor, DescriptionHashtagPanel, ReferenceMediaPicker, CreatorPreview, IntegrationAccordion and BillingPanel. These names do not claim Noise's original source structure.

Use separate models for brand profile, onboarding draft, campaign settings, playbook content/version, post/review state, ad-launch defaults, billing ledger and integrations. Add to the domain proposal: ordered scenes with instruction text and text options; ordered slideshow slides linked to media groups; reusable media assets and references; template IDs/format compatibility; description options and hashtags; invoices/charge attempts/credit events; invitations/membership roles; conversations/members/messages; per-organization feature entitlements. Store uploaded payment information through a chosen payment provider's hosted controls; the actual provider is unknown.

Suggested state boundaries:

- Onboarding: explicit step + local/server draft + completion markers; Back retains choices. Resume rules require a product decision because they were not observed.
- Campaign: pricing mode separate from active/paused; review eligibility and plan checks occur on the server. Budget targets must not be presented as hard daily limits.
- Playbook: draft content/version separate from active distribution. Publication checks campaign association, supported content, required media and payment readiness according to decided policy. Noise's exact checks are unknown.
- Post: submitted/approved/rejected review states; content attribution and valid-view earning are separate from lifetime social metrics.
- Ad: local launch draft, prerequisite checks, platform authorization and launch confirmation; chosen provider IDs separate from Noise post IDs. Connected flow is unobserved.
- Billing: charge threshold, earned-spend events, credits and charge attempts kept separately. Make retries idempotent and expose failure states; exact Noise behavior is unobserved.

Query-state proposal: encode date range, organic view, campaign/playbook/platform filters, comparison dimensions, view layout and sort/pagination in a stable contract; only some keys were observed. Avoid losing a user's reporting context on drilldown/Back. Do not expose tokens in browser URLs or evidence artifacts.

### Suggested build order

| Phase | Concrete deliverable | Completion condition |
|---|---|---|
| 1 | Shared shells, navigation, route handling, empty states, theme tokens | All observed top-level routes work; specialized editors use their own shells |
| 2 | Two separate onboarding flows, profile editor, payment-defer state | Visible screenshot steps match; unresolved step 5/step 1 are explicitly decided rather than invented |
| 3 | Campaign form, plan gates, budgets and campaign/playbook tables | Paused/active states and pricing modes stay distinct; no accidental activation on edit |
| 4 | UGC editor and slideshow behavior | Ordered content, references, descriptions, hashtags, preview and valid combination counts persist correctly |
| 5 | Post/creator reporting and review | UTC filters, created/active modes, weighted metrics, attribution and pagination match contracts |
| 6 | Payment, matching credits, integrations and roles | Provider flows verified; charges and access controls enforced server-side |
| 7 | Connected paid-ad launch and messaging | Real connected-account flows, submission selection and entitlements verified end to end |
| 8 | Marketing polish and production quality | Responsive, accessible, reduced-motion, loading, empty/error and recovery states reviewed |

This order is a recommendation, not a recovered Noise delivery sequence.

### Acceptance criteria

1. Preserve two onboarding systems and their different shells. The platform progress indicator has 11 positions; acquisition has 3. Missing screen labels remain unknown until a product decision or new evidence supplies them.
2. Do not seed new users with Annie, Test, Testingcreators, Sports, historical date ranges, account IDs or demo performance. Provide clearly labelled fixtures in development only.
3. Check selection and disabled states using real values, not the words Active/Selected alone. Keyboard focus, Escape/Close, and Back must behave coherently.
4. Separate loading from empty. The reference list and forecasts loaded asynchronously; a zero placeholder must not appear as a settled result.
5. Represent daily budgets as averages, with the documented weekly behavior. Fixed budgets use distinct renewal windows and stop conditions. Keep forecasts labelled estimates and document their assumptions.
6. Compute period CPM from total spend/total views and percentage engagement from fractions. Treat unique creators and install source series correctly. Reporting days and calendar filters are UTC.
7. Preserve created-in-range versus active-in-range semantics, Custom Posts and unattributed-post sentinels, and server-side sorting/pagination. Do not invent populated layouts from an empty account without labelling the design as proposed.
8. Keep creator admission approval separate from post approval and campaign activation. Only valid, approved earnings should affect the ledger; paused campaign behavior follows the documented contract.
9. Gate restricted controls and actions using server entitlements. Hiding controls alone is insufficient. Billing is owner-only according to docs; detailed Member permissions need a chosen matrix.
10. Editing draft content must not publish, activate or charge. Campaign creation, playbook publication, account connection, invitation and ad launch need explicit user actions in the product flow.
11. Resolve the $5 payment validation disclosure, matching-credit mechanics, and Basic/Standard label mapping before production. Do not silently assume the onboarding payment promise overrides Billing.
12. Test payment/OAuth failure, expired permissions, duplicate requests, reloading, multi-tab edits, incomplete media, upload errors and disconnected integrations in a chosen test environment. These outcomes were not tested on Noise.
13. Verify creator-post/ad rights and attribution rules as product requirements; marketing ads examples do not establish a rights contract.
14. Inspect responsive layouts independently. Desktop screenshots and computed values do not establish mobile breakpoints, focus order, contrast compliance or motion preferences.

### Decisions still needed

Highest-priority gaps: acquisition step 1; two hidden role labels; platform step 5; form errors/requirements; estimator range/formula; referral-code conditional fields; payment entry and defer/completion behavior; playbook save/publication rules; connected ad creation and populated reporting; media upload limits; manual pricing detail; creator detail/removal; exact plan permissions and credit rules. Current-versus-guide differences require per-format/version resolution, not a blanket claim that one source is wrong.

The interface suggests accessible component patterns but does not prove a particular framework, database, hosting service, chart library or payment provider. An equivalent product can be implemented in the user's chosen stack without pretending those internals were discovered.


---

## Noise handoff: evidence audit and build acceptance criteria

Reviewed `live-evidence.json` (L01–L38) and `onboarding-spec.md` (A01–A08, B01–B09), plus the captured Campaigns and Slideshow documentation. This is an audit of visible product behavior. It does not recover Noise's backend, source, database, pricing algorithm, or production integration contracts. Criteria below are proposed requirements for an equivalent implementation; they are not claims that untested behavior was observed.

### Material review points

1. **Separate rendered messaging state from DOM presence.** L01–L04 include a Noise Team composer; L09 and later include an All messages banner, channel sidebar, search, and plan gate. The inspecting agent reports that the rendered Live screenshot showed only the minimized floating dock while the accessibility snapshot still included panel content. DOM membership does not establish that the panel was visible. **Acceptance:** specify minimized, floating window, docked sidebar, channel list, and conversation as separate states. Only the active state is visible/focusable; close/minimize restores focus; route changes preserve the chosen presentation deliberately. Do not position every captured panel at once.

2. **Account for asynchronous hydration before calling a state contradictory.** Stable L05–L07 show Draft and one reference video. The inspecting agent reports that the first editor snapshot briefly showed zero references/“No reference videos yet,” followed by one loaded example without a mutation. L17→L18 also changes estimated monthly views from 5,876,536 to 4,685,384 and posts from 22,092 to 17,538 while the displayed budget stays $500/day. No causal formula was established. **Acceptance:** distinguish loading, resolved-empty, populated, error, and stale states; avoid treating provisional zero counts as durable emptiness. Fixture tests should confirm editor data and estimates settle consistently after load. Do not reverse engineer an estimator from these transient values.

3. **Keep marketing samples, projections, and account data distinct.** L30's public homepage includes 78.7M total views, a $1.16 CPM, sample creator/post content, and promotional network claims. L01/L09 show zero live views for Testingcreators; L02/L10 show no posts or creators. B02's 20M projected views and 8,333 estimated creators are onboarding projections, not realized activity. **Acceptance:** use separate demonstration, forecast, and organization-reporting data sources. The inspected organization renders its observed empty states; marketing mockups never seed its reporting totals. Label estimate outputs and treat public claims as displayed copy, not independently verified facts.

4. **Resolve payment copy and plan names before implementing money flows.** A/B onboarding says “nothing up front”/no full budget upfront; live Billing L13 explicitly says setup charges a non-refundable $5 validation credit applied to future creator payments. Public pricing L29 calls the free tier Standard; account Billing calls it Noise Basic. Unlimited is $99/month minimum spend credited to campaign spend, not a proven additional campaign fee. **Acceptance:** keep plan identifiers separate from display labels until alias/migration rules are confirmed. Show the validation credit and its application before payment confirmation if implementing that observed billing behavior. Maintain separate campaign spend, balance, threshold, subscription credit, and matching credit concepts. The $10/$25/$50 choices are charge thresholds, not scheduled time intervals. Payment/provider success, failure, and deferred onboarding remain unobserved.

5. **Model campaign pause, playbook draft, and published visibility separately.** L03/L04 use switches named “Active,” but their snapshots do not contain `[checked]`; the name alone is not evidence that the switch is on. L23 explicitly labels the available campaign “Testingcreators (Paused).” The UGC editor L05–L07 says Draft. Top-level Playbooks 1 versus the campaign row's Playbooks 0 may count different eligibility/status scopes; no count rule was demonstrated. **Acceptance:** define explicit campaign and playbook status fields and count inclusion rules. A draft can appear in management lists without being available to creators. A paused campaign must not become active because its control label says Active. Test creator availability, reporting counts, and spending eligibility independently.

6. **Do not fill the missing onboarding or format transition with invented behavior.** A04 hides two role labels; marketing step 1 and platform progress position 5 are absent. B04 apparently selects Slideshow but B05 selects Greenscreen, and live L04/L05 identifies Greenscreen as `ugc_script`. This can result from another run or changed selection; it does not prove automatic format conversion or a defect. The existing-account public Start CTA redirected to Home (L31), leaving new-account signup unobserved. **Acceptance:** mark unknown screens/branches explicitly. Specify proposed validation and persistence as design decisions pending confirmation. Support format-compatible template selection and deliberate handling when format changes; test each fresh-account path once evidence exists. Do not treat Test→Testingcreators as an observed naming transformation.

7. **Scope official documentation by format and version.** Captured Slideshow instructions use `+ New Playbook`, media groups, separate Edit Hashtags/Edit Description, Save, and Setup & Activate. Current inspected UGC L05–L07 uses scenes, References, combined Hashtags & Descriptions, Draft, and Publish. Slideshow documentation says pick 2–3 hashtags; the UGC dialog says hashtags are added to every post. These differ, but a different format can explain some of the difference. Campaign docs mention TikTok/Instagram targeting; live L20 also offers YouTube, Snapchat, and Facebook Reels. **Acceptance:** use current observed controls for the inspected editor, and clearly mark slideshow/legacy workflows as documented rather than live-verified. Do not transfer slideshow randomization or legacy Save behavior into UGC. Maintain format-specific content schemas and an explicit supported-platform set.

8. **Build URL state and local UI state as separate contracts.** Observed Organic URLs encode `tab=campaigns|playbooks|posts`, `campaign=20192`, `comparisons=none`, and date keys `from`/`to` (L01–L04). Ads uses `view=submissions` and creation uses `/ads/new?pick=1` (L37–L38). Ad settings tabs and campaign setup panels change within unchanged routes (L17–L22, L26–L28). Not every filter/dialog is proven to serialize to the URL. **Acceptance:** document which state is deep-linkable and which is local. Reload/back/forward restore encoded tab, campaign and dates; clearing a filter removes its effect predictably. Date range Apply commits, Cancel discards, and UTC aggregation matches L36's “All times in UTC.” Do not promote observed entity IDs into constants. Test malformed/unknown query values and inaccessible organization/entity IDs.

9. **Do not confuse demonstrated controls with tested writes or complete gates.** The inspection opened tabs/dialogs but did not submit Save, Publish, Create campaign, Send invites, payment, OAuth, or a message. L38 proves that Create ads is blocked without a Meta/TikTok ad connection; it does not establish the launch wizard after connection. Unlimited icons show restrictions, but enforcement and upgrade outcomes were untested. **Acceptance:** cover validation, dirty-state handling, server rejection, success confirmation, authorization, entitlement checks, and retry behavior in the proposed build. Connect/disconnect, invitation delivery, publishing, ad launch, and billing require separate implementation contracts and controlled test environments. A button existing in the snapshot is not proof that its action succeeded.

10. **Limit visual fidelity claims to the available rendered evidence.** Seventeen supplied screenshots cover marketing/onboarding/integrations; live dashboard captures are predominantly accessibility snapshots. The inspecting agent obtained one Live screenshot with an oversized blank canvas and hit screenshot timeouts on other routes. No mobile breakpoints, dense populated dashboard tables, error layouts, or full slideshow editor were rendered and inspected. **Acceptance:** compare reconstructed screens at measured desktop viewports, inspect every responsive layout, and add populated/empty/loading/error fixtures. Verify keyboard focus, dialog dismissal, table scrolling, and sidebar collapse. Treat sizes, colors, sticky placement, globe animation, and missing screen assets as implementation choices until rendered evidence confirms them.

### Implementation priority

Build the proven shell, route map, empty account screens, Organic tabs, inspected UGC editor, settings, integrations forms, and plan-gated placeholders first. Keep unresolved payment/activation behavior, missing onboarding steps, estimator internals, populated analytics, OAuth and creator-side workflows in a clearly labelled follow-up checklist. This permits a reviewable interface and domain model without misrepresenting recovered backend behavior.
