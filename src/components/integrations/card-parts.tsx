"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, InlineAlert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/server/action-result";
import type { DisplayStatus, InstallationView } from "@/server/integrations/installations";
import { errorMessage, formatUtc, statusLabels } from "./labels";
import { useStepUp } from "./step-up";

/** Expandable provider card: the header (title, summary, status) toggles the body. */
export function IntegrationCard({
  id,
  icon,
  title,
  description,
  status,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  status?: DisplayStatus;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const badge = status ? statusLabels[status] : null;
  return (
    <section id={id} className="scroll-mt-6 rounded-[12px] border border-line bg-surface" aria-labelledby={`${bodyId}-title`}>
      <div className="relative flex gap-3 px-4 py-4 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-line bg-canvas text-ink-2" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={`${bodyId}-title`} className="text-[15px] font-semibold text-ink">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen((v) => !v)}
                className="text-left after:absolute after:inset-0 after:rounded-[12px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2"
              >
                {title}
                <span className="sr-only"> details</span>
              </button>
            </h2>
            {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
          {summary ? <p className="mt-1 text-[13px] text-ink-2">{summary}</p> : null}
        </div>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </div>
      <div id={bodyId} hidden={!open} className="border-t border-line px-4 py-4 sm:px-5">
        {open ? children : null}
      </div>
    </section>
  );
}

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const { notify } = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn("max-md:min-h-11", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          notify("Couldn't copy automatically. Select the text and copy it manually.", "danger");
        }
      }}
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      <span>{copied ? "Copied" : label}</span>
    </Button>
  );
}

/** Read-only value with a copy button (IDs, URLs, service-account emails). */
export function CopyableValue({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[13px] font-medium text-ink">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <code aria-labelledby={id} className="min-w-0 break-all rounded-[6px] bg-selected px-2 py-1 font-mono text-[12.5px] text-ink">
          {value}
        </code>
        <CopyButton value={value} label={`Copy`} />
      </div>
    </div>
  );
}

/** What we know about the stored installation: who, when, scopes, assets, sync and the last error. */
export function InstallationDetails({ installation, assetLabel, extra }: { installation: InstallationView; assetLabel?: string; extra?: Array<[string, ReactNode]> }) {
  const rows: Array<[string, ReactNode]> = [
    ["Connected by", installation.connectedBy ?? "—"],
    [installation.connectedAt ? "Connected" : "Submitted", formatUtc(installation.connectedAt ?? installation.updatedAt)],
    ...(installation.verifiedAt ? ([["Last verified", formatUtc(installation.verifiedAt)]] as Array<[string, ReactNode]>) : []),
    ["Last successful sync", installation.lastSyncAt ? formatUtc(installation.lastSyncAt) : "No import has run yet"],
    ...(extra ?? []),
  ];
  if (installation.grantedScopes.length) {
    rows.push(["Granted permissions", <span key="scopes" className="font-mono text-[12.5px]">{installation.grantedScopes.join(", ")}</span>]);
  }
  if (assetLabel) {
    rows.push([
      assetLabel,
      installation.selectedAssets.length ? (
        <ul key="assets" className="flex flex-col gap-0.5">
          {installation.selectedAssets.slice(0, 20).map((a) => (
            <li key={a.id}>
              {a.name} <span className="font-mono text-[12px] text-muted">{a.id}</span>
            </li>
          ))}
          {installation.selectedAssets.length > 20 ? <li className="text-muted">and {installation.selectedAssets.length - 20} more</li> : null}
        </ul>
      ) : (
        "None"
      ),
    ]);
  }
  const error = errorMessage(installation.lastErrorCategory);
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <InlineAlert tone={installation.status === "error" ? "danger" : "warning"} title={installation.lastErrorAt ? `Latest issue · ${formatUtc(installation.lastErrorAt)}` : "Latest issue"}>
          {error}
        </InlineAlert>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,11rem)_1fr]">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted">{term}</dt>
            <dd className="min-w-0 break-words text-ink max-sm:mb-1">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Disconnect with confirmation; disables locally first, then asks the provider to revoke. */
export function DisconnectButton({
  providerName,
  label = "Disconnect",
  consequence,
  disconnect,
  disabled,
}: {
  providerName: string;
  label?: string;
  consequence: ReactNode;
  disconnect: () => Promise<ActionResult<{ outcome: "disconnected" | "revocation_pending" }>>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run } = useStepUp();
  const { notify } = useToast();
  return (
    <>
      <Button variant="secondary" size="sm" className="max-md:min-h-11" disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        size="sm"
        title={`${label} ${providerName}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await run(disconnect);
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                notify(result.message ?? "Disconnected.", result.data.outcome === "disconnected" ? "success" : "neutral");
              }}
            >
              {label}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
          {consequence}
        </div>
      </Dialog>
    </>
  );
}

export function StepsList({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-2 marker:text-muted">{children}</ol>;
}
