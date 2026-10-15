import "server-only";
import { isValidDay, MAX_RANGE_DAYS, rangeLengthDays, type DateRange } from "@/domain/date-range";
import { authenticateApiToken, grantHasScope, type AuthenticatedGrant } from "../api-grants";
import type { ApiGrantScope } from "../db/schema";
import { consumeRateLimit, type RateLimitResult } from "../rate-limit";
import {
  dailyMetricNames,
  MAX_PAGE_SIZE,
  postSorts,
  type DailyMetricName,
  type DailyReportParams,
  type PostQueryParams,
} from "../reporting";

/**
 * Shared request handling for this product's Reporting API (/api/v1/*):
 * bearer authentication, scope check, per-grant rate limit, strict query
 * validation and a uniform `{ error: { code, message } }` envelope.
 * Documented in docs/api.md.
 */

export const API_RATE_LIMIT = { limit: 120, windowSeconds: 60 } as const;
const MAX_FILTER_IDS = 100;

export type ApiErrorCode = "unauthorized" | "insufficient_scope" | "invalid_request" | "rate_limited" | "internal_error";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const invalid = (message: string) => new ApiRequestError(400, "invalid_request", message);

function rateLimitHeaders(limit: RateLimitResult | null): Record<string, string> {
  if (!limit) return {};
  return {
    "X-RateLimit-Limit": String(limit.limit),
    "X-RateLimit-Remaining": String(limit.remaining),
    "X-RateLimit-Reset": String(Math.ceil(limit.resetAt.getTime() / 1000)),
  };
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Authorization", ...extra },
  });
}

function errorResponse(status: number, code: ApiErrorCode, message: string, extra: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, extra);
}

/**
 * Runs `handler` for an authenticated, in-scope, within-quota request. The
 * handler receives the grant's organization; nothing from the request can
 * select another one.
 */
export async function handleApiRequest(
  request: Request,
  scope: ApiGrantScope,
  handler: (auth: AuthenticatedGrant, params: URLSearchParams) => Promise<unknown>,
): Promise<Response> {
  let limit: RateLimitResult | null = null;
  try {
    const auth = await authenticateApiToken(request.headers.get("authorization"));
    if (!auth) {
      return errorResponse(401, "unauthorized", "Missing, invalid, expired or revoked token. Send Authorization: Bearer <token>.", {
        "WWW-Authenticate": 'Bearer realm="reporting"',
      });
    }
    limit = await consumeRateLimit(`api:grant:${auth.grant.id}`, API_RATE_LIMIT.limit, API_RATE_LIMIT.windowSeconds);
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000));
      return errorResponse(429, "rate_limited", "Rate limit exceeded for this token. Retry after the reset time.", {
        ...rateLimitHeaders(limit),
        "Retry-After": String(retryAfter),
      });
    }
    if (!grantHasScope(auth.grant, scope)) {
      return errorResponse(403, "insufficient_scope", `This token does not have the ${scope} scope.`, rateLimitHeaders(limit));
    }
    const body = await handler(auth, new URL(request.url).searchParams);
    return json(body, 200, rateLimitHeaders(limit));
  } catch (error) {
    if (error instanceof ApiRequestError) return errorResponse(error.status, error.code, error.message, rateLimitHeaders(limit));
    console.error("[api] unexpected error:", error instanceof Error ? error.name : "unknown");
    return errorResponse(500, "internal_error", "Something went wrong. Try again later.", rateLimitHeaders(limit));
  }
}

/* ----------------------------------------------------------------------------
 * Query parsing
 * ------------------------------------------------------------------------- */

function single(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) throw invalid(`${name} may only be given once.`);
  const value = values[0]?.trim();
  return value ? value : undefined;
}

function list(params: URLSearchParams, name: string): string[] | undefined {
  const raw = single(params, name);
  if (raw === undefined) return undefined;
  const items = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (items.length === 0) throw invalid(`${name} must not be empty.`);
  return items;
}

/** Required inclusive UTC date range, at most MAX_RANGE_DAYS long. */
export function parseDateRange(params: URLSearchParams): DateRange {
  const from = single(params, "start_date");
  const to = single(params, "end_date");
  if (!from || !to) throw invalid("start_date and end_date are required (YYYY-MM-DD, UTC).");
  if (!isValidDay(from)) throw invalid("start_date must be a valid date in YYYY-MM-DD format.");
  if (!isValidDay(to)) throw invalid("end_date must be a valid date in YYYY-MM-DD format.");
  if (from > to) throw invalid("start_date must be on or before end_date.");
  if (rangeLengthDays({ from, to }) > MAX_RANGE_DAYS) throw invalid(`The date range may span at most ${MAX_RANGE_DAYS} days.`);
  return { from, to };
}

const idPattern = /^(0|[a-z]{3,4}_[a-z0-9]{6,40})$/;

/** Comma-separated campaign/playbook IDs; `0` is the Unattributed / Custom Posts sentinel. */
export function parseIdList(params: URLSearchParams, name: "campaign_id" | "playbook_id"): string[] | undefined {
  const ids = list(params, name);
  if (!ids) return undefined;
  if (ids.length > MAX_FILTER_IDS) throw invalid(`${name} accepts at most ${MAX_FILTER_IDS} IDs.`);
  const bad = ids.find((id) => !idPattern.test(id));
  if (bad) throw invalid(`${name} contains an invalid ID. Use IDs from /campaigns or /playbooks, or 0.`);
  return ids;
}

function parseEnumList<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T[] | undefined {
  const items = list(params, name);
  if (!items) return undefined;
  const bad = items.find((i) => !(allowed as readonly string[]).includes(i));
  if (bad) throw invalid(`${name} accepts: ${allowed.join(", ")}.`);
  return items as T[];
}

function parseEnum<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[], fallback: T): T {
  const value = single(params, name);
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) throw invalid(`${name} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}

function parsePositiveInt(params: URLSearchParams, name: string, fallback: number, max?: number): number {
  const value = single(params, name);
  if (value === undefined) return fallback;
  if (!/^\d{1,6}$/.test(value) || Number(value) < 1) throw invalid(`${name} must be a positive integer.`);
  const n = Number(value);
  if (max !== undefined && n > max) throw invalid(`${name} may be at most ${max}.`);
  return n;
}

export function parseDailyReportQuery(params: URLSearchParams): DailyReportParams {
  return {
    range: parseDateRange(params),
    groupBy: parseEnumList(params, "group_by", ["campaign", "playbook"] as const) ?? [],
    campaignIds: parseIdList(params, "campaign_id"),
    playbookIds: parseIdList(params, "playbook_id"),
    metrics: parseEnumList<DailyMetricName>(params, "metrics", dailyMetricNames),
  };
}

export const DEFAULT_PAGE_SIZE = 25;

export function parsePostsQuery(params: URLSearchParams): PostQueryParams {
  return {
    range: parseDateRange(params),
    mode: parseEnum(params, "mode", ["created", "active"] as const, "created"),
    campaignIds: parseIdList(params, "campaign_id"),
    playbookIds: parseIdList(params, "playbook_id"),
    page: parsePositiveInt(params, "page", 1, 100_000),
    pageSize: parsePositiveInt(params, "page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    sort: parseEnum(params, "sort", postSorts, "posted"),
    order: parseEnum(params, "order", ["asc", "desc"] as const, "desc"),
  };
}

/** Rejects parameters an endpoint doesn't define, so typos don't silently widen a query. */
export function assertKnownParams(params: URLSearchParams, allowed: readonly string[]): void {
  for (const key of new Set(params.keys())) {
    if (!allowed.includes(key)) throw invalid(`Unknown parameter: ${key.slice(0, 40)}.`);
  }
}
