import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { grantableRoles } from "@/domain/permissions";
import { site } from "@/config/site";
import { hasPermission, loadOrgContext, requireOrgPage } from "@/server/authz";
import { listInvitations, MAX_INVITES_PER_REQUEST, type InviteDisplayStatus } from "@/server/invitations";
import { listTeamMembers, listTransferCandidates, roleLabels, type Paged } from "@/server/members";
import { Badge, type Tone } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { Card } from "@/components/ui/layout";
import { Table, TableScroll, TD, TH, THead, TR } from "@/components/ui/table";
import { InviteActions } from "@/components/members/invite-actions";
import { InviteDialog } from "@/components/members/invite-dialog";
import { LeaveTeam } from "@/components/members/leave-team";
import { MemberActions } from "@/components/members/member-actions";
import { TransferOwnership } from "@/components/members/transfer-ownership";
import { formatDateTime, formatNumericDate } from "@/components/members/format";
import {
  changeMemberRoleAction,
  inviteMembersAction,
  leaveWorkspaceAction,
  removeMemberAction,
  renewInvitationAction,
  revokeInvitationAction,
  transferOwnershipAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx ? `Members · ${ctx.org.name}` : "Members" };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pageParam = (v: string | string[] | undefined) => {
  const n = Number.parseInt(first(v), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const statusBadge: Record<InviteDisplayStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "info" },
  expired: { label: "Expired", tone: "warning" },
  revoked: { label: "Revoked", tone: "neutral" },
};

/**
 * Members (L14): Team Members and Pending Invites, each with its own search
 * (`mq` / `iq`) and pagination (`mp` / `ip`) in the URL; the invite dialog
 * (L32); and ownership/leave controls. Pending invites are visible to those
 * who can invite (owners).
 */
export default async function MembersPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const ctx = await requireOrgPage(slug, `/home/${slug}/members`);
  const sp = await searchParams;
  const state = { mq: first(sp.mq).trim().slice(0, 100), mp: pageParam(sp.mp), iq: first(sp.iq).trim().slice(0, 100), ip: pageParam(sp.ip) };
  const basePath = `/home/${ctx.org.slug}/members`;
  const href = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    const params = new URLSearchParams();
    if (next.mq) params.set("mq", next.mq);
    if (next.mp > 1) params.set("mp", String(next.mp));
    if (next.iq) params.set("iq", next.iq);
    if (next.ip > 1) params.set("ip", String(next.ip));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const canInvite = hasPermission(ctx, "members:invite");
  const [members, invites, candidates] = await Promise.all([
    listTeamMembers(ctx, { query: state.mq, page: state.mp }),
    canInvite ? listInvitations(ctx, { query: state.iq, page: state.ip }) : Promise.resolve(null),
    listTransferCandidates(ctx),
  ]);
  const s = ctx.org.slug;
  const roles = grantableRoles(ctx.actor);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold leading-7 text-ink">Members</h1>
        <p className="mt-1 text-sm text-muted">Manage your team members and pending invitations.</p>
      </header>

      <section aria-labelledby="team-members-heading" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="team-members-heading" className="text-[15px] font-semibold text-ink">
              Team Members
            </h2>
            <p className="mt-0.5 text-sm text-muted">Here you can manage the members of your team.</p>
          </div>
          {canInvite ? (
            <InviteDialog roles={roles} maxInvites={MAX_INVITES_PER_REQUEST} inviteAction={inviteMembersAction.bind(null, s)} />
          ) : (
            <p className="text-[13px] text-muted">Only workspace owners can invite teammates.</p>
          )}
        </div>
        <SearchBox id="search-members" name="mq" label="Search members" value={state.mq} action={basePath} keep={{ iq: state.iq }} />
        <Card className="overflow-hidden">
          <TableScroll label="Team members">
            <Table className="min-w-[680px]">
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Joined at</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {members.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                      No results.
                    </td>
                  </tr>
                ) : (
                  members.rows.map((m) => (
                    <TR key={m.userId}>
                      <TD className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          {m.name}
                          {m.isYou ? <Badge>You</Badge> : null}
                        </span>
                      </TD>
                      <TD className="text-ink-2">{m.email}</TD>
                      <TD>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{roleLabels[m.role]}</Badge>
                          {m.isPrimaryOwner ? <Badge tone="info">Primary Owner</Badge> : null}
                        </span>
                      </TD>
                      <TD className="tabular-nums text-ink-2">{formatNumericDate(m.joinedAt)}</TD>
                      <TD className="text-right">
                        {m.canManage ? (
                          <MemberActions
                            member={{ userId: m.userId, name: m.name, email: m.email, role: m.role }}
                            roleOptions={m.roleOptions}
                            changeRoleAction={changeMemberRoleAction.bind(null, s)}
                            removeAction={removeMemberAction.bind(null, s)}
                          />
                        ) : null}
                      </TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </TableScroll>
          <Pager paged={members} label="Team members pages" prevHref={href({ mp: members.page - 1 })} nextHref={href({ mp: members.page + 1 })} />
        </Card>
      </section>

      {invites ? (
        <section aria-labelledby="pending-invites-heading" className="mb-8">
          <div className="mb-3">
            <h2 id="pending-invites-heading" className="text-[15px] font-semibold text-ink">
              Pending Invites
            </h2>
            <p className="mt-0.5 text-sm text-muted">Here you can manage the pending invitations to your team. Invitations expire after 7 days.</p>
          </div>
          <SearchBox id="search-invitations" name="iq" label="Search Invitations" value={state.iq} action={basePath} keep={{ mq: state.mq }} />
          <Card className="overflow-hidden">
            <TableScroll label="Pending invites">
              <Table className="min-w-[760px]">
                <THead>
                  <tr>
                    <TH>Email</TH>
                    <TH>Role</TH>
                    <TH>Invited at</TH>
                    <TH>Expires at</TH>
                    <TH>Status</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {invites.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                        No results.
                      </td>
                    </tr>
                  ) : (
                    invites.rows.map((inv) => (
                      <TR key={inv.id}>
                        <TD className="font-medium">{inv.email}</TD>
                        <TD>{roleLabels[inv.role]}</TD>
                        <TD className="text-ink-2" title={`Invited by ${inv.invitedBy}`}>
                          {formatDateTime(inv.invitedAt)}
                        </TD>
                        <TD className="text-ink-2">{formatDateTime(inv.expiresAt)}</TD>
                        <TD>
                          <Badge tone={statusBadge[inv.status].tone}>{statusBadge[inv.status].label}</Badge>
                        </TD>
                        <TD className="text-right">
                          {inv.canManage ? (
                            <InviteActions invite={inv} renewAction={renewInvitationAction.bind(null, s)} revokeAction={revokeInvitationAction.bind(null, s)} />
                          ) : (
                            <span className="text-[13px] text-muted">Primary owner only</span>
                          )}
                        </TD>
                      </TR>
                    ))
                  )}
                </tbody>
              </Table>
            </TableScroll>
            <Pager paged={invites} label="Pending invites pages" prevHref={href({ ip: invites.page - 1 })} nextHref={href({ ip: invites.page + 1 })} />
          </Card>
        </section>
      ) : null}

      {ctx.actor.isPrimaryOwner ? (
        <section aria-labelledby="ownership-heading" className="mb-8">
          <h2 id="ownership-heading" className="mb-3 text-[15px] font-semibold text-ink">
            Primary ownership
          </h2>
          <Card className="px-5 py-4">
            <TransferOwnership candidates={candidates} transferAction={transferOwnershipAction.bind(null, s)} />
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="leave-heading" className="mb-8">
        <h2 id="leave-heading" className="mb-3 text-[15px] font-semibold text-ink">
          Leave team
        </h2>
        <Card className="px-5 py-4">
          <LeaveTeam workspaceName={ctx.org.name} isPrimaryOwner={ctx.actor.isPrimaryOwner} leaveAction={leaveWorkspaceAction.bind(null, s)} />
        </Card>
      </section>

      {site.supportEmail ? (
        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Questions?</h2>
          <p className="mt-1 text-sm text-muted">
            Contact{" "}
            <a href={`mailto:${site.supportEmail}`} className="font-medium text-ink underline underline-offset-2">
              {site.supportEmail}
            </a>
            .
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function SearchBox({ id, name, label, value, action, keep }: { id: string; name: string; label: string; value: string; action: string; keep: Record<string, string> }) {
  return (
    <Form action={action} scroll={false} replace role="search" aria-label={label} className="relative mb-3 w-full sm:w-72">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input id={id} name={name} type="search" defaultValue={value} placeholder={label} maxLength={100} autoComplete="off" className="pl-8 max-md:h-11" />
    </Form>
  );
}

function Pager<T>({ paged, label, prevHref, nextHref }: { paged: Paged<T>; label: string; prevHref: string; nextHref: string }) {
  const totalPages = Math.max(1, Math.ceil(paged.total / paged.pageSize));
  const cls = "inline-flex h-8 items-center gap-1 rounded-[8px] border border-line px-2.5 text-[13px] max-md:h-11";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-[13px] text-muted">
      <p>
        Page {paged.page} of {totalPages} · {paged.total.toLocaleString("en-US")} total
      </p>
      <div className="flex gap-2">
        {paged.page > 1 ? (
          <Link href={prevHref} scroll={false} className={`${cls} text-ink hover:bg-hover`}>
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
          </Link>
        ) : (
          <span className={`${cls} text-subtle`} aria-disabled="true">
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
          </span>
        )}
        {paged.page < totalPages ? (
          <Link href={nextHref} scroll={false} className={`${cls} text-ink hover:bg-hover`}>
            Next <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className={`${cls} text-subtle`} aria-disabled="true">
            Next <ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
