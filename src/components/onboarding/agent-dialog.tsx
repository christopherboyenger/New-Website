"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Bot, Check, Copy } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { NotConfiguredNotice } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { headerActionClass } from "./surface";

/**
 * "Onboard with your agent": explains how an AI client connects to this
 * product's own MCP server. While that server is not deployed the dialog
 * says so instead of showing a connector URL (never the reference's URL).
 */
export interface AgentConnection {
  configured: boolean;
  /** This deployment's MCP endpoint, only when the capability is configured. */
  url: string | null;
}

const clients = [
  { key: "claude", label: "Claude" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
] as const;
type ClientKey = (typeof clients)[number]["key"];

export function AgentDialogButton({ connection, productName }: { connection: AgentConnection; productName: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ClientKey>("claude");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const client = clients.find((c) => c.key === active)!;

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = clients.findIndex((c) => c.key === active);
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: clients.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + clients.length) % clients.length;
    setActive(clients[next].key);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <button type="button" className={headerActionClass} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Bot className="size-4 text-accent" aria-hidden="true" />
        <span className="hidden sm:inline">Onboard with your agent</span>
        <span className="sm:hidden">Agent setup</span>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Onboard with your agent"
        description="Turn your ideas, or something you’ve seen before, into a slideshow or UGC script creators will post."
      >
        <div role="tablist" aria-label="AI client" className="flex flex-wrap gap-1" onKeyDown={onTabKeyDown}>
          {clients.map((c, i) => (
            <button
              key={c.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`agent-tab-${c.key}`}
              aria-selected={active === c.key}
              aria-controls="agent-tabpanel"
              tabIndex={active === c.key ? 0 : -1}
              onClick={() => setActive(c.key)}
              className={cn(
                "h-9 rounded-[8px] px-3 text-sm font-medium transition-colors",
                active === c.key ? "bg-slate-fill text-navy ring-1 ring-slate-line" : "text-slate-help hover:text-navy",
              )}
            >
              For {c.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="agent-tabpanel" aria-labelledby={`agent-tab-${active}`} className="mt-4">
          {connection.configured && connection.url ? (
            <ConnectInstructions url={connection.url} clientLabel={client.label} productName={productName} />
          ) : (
            <NotConfiguredNotice title="Agent connection isn’t available yet">
              The {productName} MCP server hasn’t been deployed, so there is no connector URL to add to {client.label} yet. You can finish setup
              here without it.
            </NotConfiguredNotice>
          )}
        </div>
      </Dialog>
    </>
  );
}

function ConnectInstructions({ url, clientLabel, productName }: { url: string; clientLabel: string; productName: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="rounded-[12px] border border-slate-line p-4">
        <p className="text-slate-help">Paste this into {clientLabel}</p>
        <div className="mt-2 flex items-center gap-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[15px] text-navy">{url}</code>
          <button type="button" onClick={copyUrl} className="rounded-md p-2 text-navy hover:bg-slate-fill" aria-label="Copy connector URL">
            {copy === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
        </div>
        <p aria-live="polite" className="mt-1 min-h-5 text-xs text-slate-help">
          {copy === "copied" ? "Copied." : copy === "failed" ? "Couldn’t copy automatically — select the URL and copy it." : ""}
        </p>
      </div>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-navy">
        <li>In {clientLabel}, add a custom connector (MCP server) and paste the URL.</li>
        <li>Sign in when {clientLabel} asks, using the email of your {productName} account.</li>
      </ol>
    </div>
  );
}
