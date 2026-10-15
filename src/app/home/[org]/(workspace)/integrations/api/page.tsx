import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { reportingApiBaseUrl } from "@/config/site";
import { dailyMetricNames, MAX_PAGE_SIZE, postSorts } from "@/server/reporting";
import { apiScopeDescriptions, issuableApiScopes } from "@/server/api-grants";
import { API_RATE_LIMIT, DEFAULT_PAGE_SIZE } from "@/server/integrations/reporting-api";
import { MAX_RANGE_DAYS } from "@/domain/date-range";
import { requireOrgPage } from "@/server/authz";
import { Card, CardBody, PageContainer, PageHeader } from "@/components/ui/layout";
import { Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Reporting API reference" };

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-selected px-1 py-0.5 font-mono text-[12.5px] text-ink">{children}</code>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card as="section">
      <CardBody className="flex flex-col gap-3 text-sm text-ink-2">
        <h2 id={id} className="scroll-mt-6 text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {children}
      </CardBody>
    </Card>
  );
}

function ParamTable({ label, rows }: { label: string; rows: Array<[string, string, ReactNode]> }) {
  return (
    <TableScroll label={label}>
      <Table>
        <THead>
          <tr>
            <TH>Parameter</TH>
            <TH>Default</TH>
            <TH>Notes</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map(([name, def, notes]) => (
            <TR key={name}>
              <TD className="whitespace-nowrap">
                <Code>{name}</Code>
              </TD>
              <TD className="whitespace-nowrap">{def}</TD>
              <TD>{notes}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}

function Pre({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-[8px] bg-canvas p-3 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>;
}

/** Concise in-app reference for this product's Reporting API (full text: docs/api.md). */
export default async function ApiReferencePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/integrations/api`);
  const base = reportingApiBaseUrl();
  const dateRows: Array<[string, string, ReactNode]> = [
    ["start_date, end_date", "required", <>YYYY-MM-DD, UTC days, inclusive, at most {MAX_RANGE_DAYS} days.</>],
    ["campaign_id", "all", <>Comma list, OR semantics. <Code>0</Code> = Unattributed. Max 100 IDs.</>],
    ["playbook_id", "all", <>Comma list. <Code>0</Code> = Custom Posts.</>],
  ];

  return (
    <PageContainer className="pt-8 sm:pt-10" width="narrow">
      <Link href={`/home/${ctx.org.slug}/integrations`} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink md:min-h-0">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Integrations
      </Link>
      <PageHeader title="Reporting API reference" description="Read-only access to this workspace's reporting data. Days are UTC; responses are JSON and never cached." />
      <div className="flex flex-col gap-4">
        <Section id="auth" title="Authentication">
          <p>
            Create a token under Integrations → Developer (owners only). Send it on every request as <Code>Authorization: Bearer &lt;token&gt;</Code>. Base URL:{" "}
            <Code>{base}</Code>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>The token is shown once; only a digest is stored. Lost tokens can&apos;t be recovered — revoke and create a new one.</li>
            <li>The organization always comes from the token; nothing in the request can select another one.</li>
            <li>Tokens stop working when revoked, when they expire, or when the owner who created them loses owner access.</li>
          </ul>
          <TableScroll label="Scopes">
            <Table>
              <THead>
                <tr>
                  <TH>Scope</TH>
                  <TH>Grants</TH>
                </tr>
              </THead>
              <tbody>
                {issuableApiScopes.map((s) => (
                  <TR key={s}>
                    <TD>
                      <Code>{s}</Code>
                    </TD>
                    <TD>{apiScopeDescriptions[s]}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </Section>

        <Section id="daily" title="GET /reports/daily">
          <p>Daily rows and period totals for approved posts. Scope <Code>reports:read</Code>.</p>
          <ParamTable
            label="Daily report parameters"
            rows={[
              ...dateRows,
              ["group_by", "date only", <>campaign, playbook, or both (comma list).</>],
              ["metrics", "all", <>Subset of {dailyMetricNames.join(", ")}.</>],
            ]}
          />
          <ul className="list-disc space-y-1 pl-5">
            <li>Rows are sparse (days without data are omitted). Views are earned that day; spend is USD.</li>
            <li>CPM = spend ÷ views × 1000, recomputed from aggregate spend and views (never averaged); null when views are 0.</li>
            <li>Totals deduplicate posts and creators across the range, so they are not the sum of rows.</li>
            <li>
              Installs are organization-wide and only returned without <Code>group_by</Code>. <Code>estimated_installs</Code> prefers store actuals over the
              estimate (<Code>totals.installs_source</Code>: store / estimated / mixed); <Code>installs_by_source</Code> keeps raw series (<Code>app_store</Code>,{" "}
              <Code>play_store</Code>, <Code>estimate</Code>) that must not be summed. Absent means unavailable, not zero.
            </li>
          </ul>
        </Section>

        <Section id="posts" title="GET /posts">
          <p>Paginated approved posts. Scope <Code>reports:read</Code>.</p>
          <ParamTable
            label="Posts parameters"
            rows={[
              ...dateRows,
              ["mode", "created", <>created: posted in the range. active: gained views in the range. Omitting campaign_id excludes unattributed posts.</>],
              ["page", "1", "1-based page number."],
              ["page_size", String(DEFAULT_PAGE_SIZE), <>1–{MAX_PAGE_SIZE}; larger values are rejected.</>],
              ["sort", "posted", postSorts.join(", ")],
              ["order", "desc", "asc or desc; nulls last."],
            ]}
          />
          <p>
            <Code>range_views</Code> and <Code>spend</Code> cover the requested range; <Code>views</Code>, likes, comments, bookmarks, shares and{" "}
            <Code>engagement_rate</Code> (fraction 0–1) are lifetime values and may be null when the platform doesn&apos;t provide them.
          </p>
        </Section>

        <Section id="choices" title="GET /campaigns and GET /playbooks">
          <p>
            Filter choices: <Code>{"{ data: [{ id, name, active }] }"}</Code> (playbooks also include <Code>campaign_id</Code>). Scopes <Code>campaigns:read</Code> /{" "}
            <Code>playbooks:read</Code>.
          </p>
        </Section>

        <Section id="errors" title="Errors and limits">
          <p>
            Errors look like <Code>{'{ "error": { "code": "invalid_request", "message": "…" } }'}</Code>. 400 invalid_request · 401 unauthorized · 403
            insufficient_scope · 429 rate_limited · 500 internal_error.
          </p>
          <p>
            {API_RATE_LIMIT.limit} requests per {API_RATE_LIMIT.windowSeconds} seconds per token. Responses include <Code>X-RateLimit-Limit</Code>,{" "}
            <Code>X-RateLimit-Remaining</Code> and <Code>X-RateLimit-Reset</Code> (Unix seconds); 429 responses add <Code>Retry-After</Code>.
          </p>
          <Pre>{`curl -H "Authorization: Bearer $TOKEN" \\\n  "${base}/reports/daily?start_date=2026-09-01&end_date=2026-09-30&metrics=views,spend,cpm"`}</Pre>
        </Section>
      </div>
    </PageContainer>
  );
}
