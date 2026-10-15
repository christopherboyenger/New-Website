"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One-time invite link for an invitation whose email was not delivered. The
 * server keeps only a digest of the token, so this is the only time the link
 * can be shown; renewing the invitation issues a new one.
 */
export function InviteLink({ url, email }: { url: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      (document.getElementById(id) as HTMLInputElement | null)?.select();
    }
  }
  return (
    <div className="mt-2 flex gap-2">
      <label htmlFor={id} className="sr-only">
        Invite link for {email}
      </label>
      <input
        id={id}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-[8px] border border-line bg-canvas px-2.5 font-mono text-xs text-ink-2"
      />
      <Button variant="secondary" size="md" onClick={copy} aria-live="polite" className="max-md:min-h-11">
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
