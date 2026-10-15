import { CheckCircle2, CircleAlert, Info, MailX } from "lucide-react";
import type { InviteResult } from "@/server/invitations";
import { InviteLink } from "./invite-link";

const copy: Record<InviteResult["outcome"], { text: string; icon: typeof Info; tone: string }> = {
  sent: { text: "Invitation email sent.", icon: CheckCircle2, tone: "text-success" },
  provider_unconfigured: {
    text: "Not emailed: no email provider is configured on this deployment. Copy the link below and share it with them yourself. It won't be shown again.",
    icon: MailX,
    tone: "text-warning",
  },
  failed: {
    text: "The email could not be delivered. Copy the link below and share it with them yourself. It won't be shown again.",
    icon: CircleAlert,
    tone: "text-danger",
  },
  already_member: { text: "Already a member of this workspace. No invitation was sent.", icon: Info, tone: "text-muted" },
  already_invited: { text: "Already has a pending invitation. Renew it from Pending Invites to send a new link.", icon: Info, tone: "text-muted" },
};

/** Per-invite delivery outcome exactly as the server reported it (never a claimed send). */
export function DeliveryResult({ result }: { result: InviteResult }) {
  const { text, icon: Icon, tone } = copy[result.outcome];
  return (
    <li className="rounded-[10px] border border-line px-3 py-2.5 text-sm">
      <p className="font-medium text-ink">{result.email}</p>
      <p className="mt-0.5 flex gap-1.5 text-ink-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
        <span>{text}</span>
      </p>
      {result.inviteUrl ? <InviteLink url={result.inviteUrl} email={result.email} /> : null}
    </li>
  );
}
