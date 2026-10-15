# Reporting API

This product's read-only Reporting API. Base URL: `{APP_URL}/api/v1` (the Integrations page shows the exact value for each deployment). All responses are JSON, `Cache-Control: no-store`. Days are UTC calendar dates.

## Authentication

Create a token in **Settings → Integrations → Developer → Create token** (workspace owners only; a recent password confirmation and a verified email are required). Send it on every request:

```
Authorization: Bearer rk_XXXXXXXX_…
```

- The token is shown **once**. Only a keyed digest and the public prefix (`rk_XXXXXXXX`) are stored, so a lost token cannot be recovered — revoke it and create a new one.
- A token belongs to exactly one organization. The organization is always taken from the token; no header, path or query parameter can select another one. The Organization ID shown on the Integrations page is for your records.
- Tokens are delegated by the owner who created them: if that person is removed from the workspace, demoted, or their account is disabled, the token stops working immediately.
- Tokens can expire (30 days, 90 days, 1 year, or never) and can be revoked at any time. At most 20 active tokens per organization.
- `last used` is recorded at most once per minute per token.

### Scopes

| Scope | Endpoints |
|---|---|
| `reports:read` | `GET /reports/daily`, `GET /posts` |
| `campaigns:read` | `GET /campaigns` |
| `playbooks:read` | `GET /playbooks` |

The API is read-only: no token can change campaigns, playbooks, billing, integrations or ads.

## Limits

120 requests per one-minute window (fixed windows, counted per token). Every authenticated response carries:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Requests allowed per window |
| `X-RateLimit-Remaining` | Requests left in the current window |
| `X-RateLimit-Reset` | Unix time (seconds) when the window resets |

When exceeded the API answers `429` with `Retry-After` (seconds). Back off until the reset time.

## Errors

Errors use one envelope:

```json
{ "error": { "code": "invalid_request", "message": "start_date must be on or before end_date." } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Missing/invalid parameter, unknown parameter, repeated parameter, range over 366 days, `page_size` over 100 |
| 401 | `unauthorized` | Missing, malformed, unknown, expired or revoked token (also when the creating owner lost access). Includes `WWW-Authenticate: Bearer` |
| 403 | `insufficient_scope` | The token lacks the endpoint's scope |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Unexpected failure; retry later |

Filter IDs that do not belong to the token's organization simply match nothing — responses never reveal whether an ID exists elsewhere.

## Shared parameters

| Parameter | Format | Notes |
|---|---|---|
| `start_date`, `end_date` | `YYYY-MM-DD` | Required on date-based endpoints. UTC days, **inclusive on both ends**, at most 366 days. |
| `campaign_id` | Comma-separated IDs | OR within the list. `0` = posts without a campaign (Unattributed). At most 100 IDs. |
| `playbook_id` | Comma-separated IDs | OR within the list. `0` = Custom Posts (no playbook). Can be combined with other IDs. |

Repeating a parameter (`?campaign_id=a&campaign_id=b`) is rejected; use a comma list.

## `GET /reports/daily`

Daily metric rows plus period totals. Scope `reports:read`.

| Parameter | Default | Notes |
|---|---|---|
| `start_date`, `end_date` | — | Required |
| `group_by` | none (date only) | `campaign`, `playbook`, or `campaign,playbook`. Date is always a dimension. |
| `campaign_id`, `playbook_id` | all | See shared parameters (`0` sentinels apply) |
| `metrics` | all | Subset of `views,spend,cpm,posts,creators,estimated_installs,installs_by_source` |

Response:

```json
{
  "meta": { "start_date": "2026-09-01", "end_date": "2026-09-30", "group_by": ["date", "campaign"], "timezone": "UTC", "row_count": 2, "data_freshness_seconds": 300 },
  "totals": { "views": 1200, "spend": 18.5, "cpm": 15.42, "posts": 3, "creators": 2 },
  "data": [
    { "date": "2026-09-02", "campaign_id": "cmp_…", "campaign_name": "Fall launch", "views": 700, "spend": 10.5, "cpm": 15, "posts": 2, "creators": 2 }
  ]
}
```

(Values above illustrate the shape only.)

Semantics:

- Only **approved** posts count. Rows are sparse: days without data are omitted.
- `views` are views earned that UTC day (incremental). Range views = sum of daily views.
- `spend` is brand cost in USD (decimal dollars, computed from integer cents).
- `cpm` = spend ÷ views × 1000, **recomputed from aggregate spend and views** for each row and for the totals (never an average of row CPMs). `null` when views are 0.
- `posts` / `creators` per row count distinct approved posts / creators with data that day; totals **deduplicate across the whole range** (so totals are not the sum of rows).
- Grouped rows include `campaign_id`/`campaign_name` (`"0"` / `Unattributed`) and/or `playbook_id`/`playbook_name` (`"0"` / `Custom Posts`).
- Installs are **organization-wide** and only appear when `group_by` is empty:
  - `estimated_installs`: blended best-available daily installs. If any store (App Store, Google Play) reported that day, it is the sum of store actuals; otherwise the third-party estimate. `totals.installs_source` is `store`, `estimated` or `mixed`.
  - `installs_by_source`: the raw series, keyed `app_store`, `play_store`, `estimate`. These can overlap — **their sum is not the blended value**. A missing key means that source reported nothing (not zero). More keys may appear later.
  - When no install source exists, the install fields are absent (not zero).

## `GET /posts`

Paginated drilldown of **approved** posts. Scope `reports:read`.

| Parameter | Default | Notes |
|---|---|---|
| `start_date`, `end_date` | — | Required |
| `mode` | `created` | `created`: posts created (posted, or submitted when no post time) in the range. `active`: posts that gained views in the range, regardless of age. |
| `campaign_id` | all campaigns | Omitting it **excludes unattributed posts**; include `0` to get them. |
| `playbook_id` | all | `0` = Custom Posts |
| `page` | `1` | 1-based |
| `page_size` | `25` | 1–100; larger values are rejected |
| `sort` | `posted` | `posted, views, range_views, likes, comments, bookmarks, shares, spend, engagement, handle` |
| `order` | `desc` | `asc` or `desc`; nulls sort last |

Response `meta`: `page`, `page_size`, `total`, `returned`, `sort`, `order`, `timezone` (`UTC`), `data_freshness_seconds`. Each post:

| Field | Meaning |
|---|---|
| `content_id`, `user_id` | Post ID and creator ID |
| `campaign_id`, `playbook_id`, `playbook_name` | `"0"` sentinels for unattributed / Custom Posts (`playbook_name` is then `null`) |
| `platform`, `handle`, `url`, `image`, `avatar_url` | Post identity (`image`/`avatar_url` may be `null`) |
| `code` | The platform's own content identifier when known, else `null` |
| `posted_at` | ISO 8601 UTC |
| `range_views` | Views gained **within the requested range** |
| `views, likes, comments, bookmarks, shares` | **Lifetime** counters; `null` when the platform doesn't provide them (never a fabricated 0) |
| `engagement_rate` | Lifetime (likes + comments + bookmarks + shares) ÷ lifetime views, a fraction 0–1; `null` without views |
| `spend` | Brand spend in USD **within the requested range** |

## `GET /campaigns` and `GET /playbooks`

Filter choices. Scopes `campaigns:read` / `playbooks:read`. No parameters.

```json
{ "data": [ { "id": "cmp_…", "name": "Fall launch", "active": true } ] }
```

Playbooks also include `campaign_id`. `active` means the campaign is active / the playbook is published and active.

## Freshness

`data_freshness_seconds` (300) is the target delay for metric ingestion, not a measured or guaranteed value. This build has no metric ingestion job yet (see [readiness](./readiness.md), "Metric ingestion"), so metrics stay empty until one is deployed; until then, `views`/`spend` totals of `0` mean "nothing has been ingested", not confirmed zero activity. Store install reports can arrive days after the install date.

## Example

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/reports/daily?start_date=2026-09-01&end_date=2026-09-30&group_by=campaign&metrics=views,spend,cpm"
```
