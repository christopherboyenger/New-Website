"use client";

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormError, Input } from "@/components/ui/form";
import type { ActionResult } from "@/server/action-result";

/**
 * Recent-authentication step-up for sensitive integration and token changes.
 * `ensureRecentAuth()` resolves true immediately while the last password
 * confirmation is fresh, otherwise asks for the password first. `run(fn)`
 * calls a Server Action and, when the server answers requires_recent_auth
 * (e.g. the window lapsed in another tab), asks for the password and retries
 * once. The server is the authority; the local expiry only saves a round trip.
 */

interface StepUpContextValue {
  ensureRecentAuth: () => Promise<boolean>;
  run: <T>(fn: () => Promise<ActionResult<T>>) => Promise<ActionResult<T>>;
}

const StepUpContext = createContext<StepUpContextValue | null>(null);

export const RECENT_AUTH_WINDOW_MS = 30 * 60 * 1000;

export function StepUpProvider({
  recentAuthExpiresAt,
  confirm,
  children,
}: {
  recentAuthExpiresAt: string | null;
  confirm: (password: string) => Promise<ActionResult<{ confirmedAt: string }>>;
  children: ReactNode;
}) {
  const [expiresAt, setExpiresAt] = useState<number>(() => (recentAuthExpiresAt ? new Date(recentAuthExpiresAt).getTime() : 0));
  const [open, setOpen] = useState(false);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      pending.current?.(false);
      pending.current = resolve;
      setOpen(true);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    pending.current?.(confirmed);
    pending.current = null;
    setOpen(false);
  }, []);

  const ensureRecentAuth = useCallback(async () => {
    if (Date.now() < expiresAt) return true;
    return ask();
  }, [ask, expiresAt]);

  const run = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
      if (!(await ensureRecentAuth())) return { ok: false, error: "Password confirmation was cancelled.", code: "requires_recent_auth" };
      const first = await fn();
      if (first.ok || first.code !== "requires_recent_auth") return first;
      setExpiresAt(0);
      if (!(await ask())) return first;
      return fn();
    },
    [ask, ensureRecentAuth],
  );

  const value = useMemo(() => ({ ensureRecentAuth, run }), [ensureRecentAuth, run]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <PasswordDialog
        open={open}
        onCancel={() => settle(false)}
        onConfirmed={() => {
          setExpiresAt(Date.now() + RECENT_AUTH_WINDOW_MS - 60_000);
          settle(true);
        }}
        confirm={confirm}
      />
    </StepUpContext.Provider>
  );
}

export function useStepUp(): StepUpContextValue {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error("useStepUp must be used inside <StepUpProvider>");
  return ctx;
}

function PasswordDialog({
  open,
  onCancel,
  onConfirmed,
  confirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirmed: () => void;
  confirm: (password: string) => Promise<ActionResult<{ confirmedAt: string }>>;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setBusy(true);
    setError(null);
    setFieldError(undefined);
    const result = await confirm(password);
    setBusy(false);
    if (result.ok) {
      form.reset();
      onConfirmed();
      return;
    }
    setError(result.error);
    setFieldError(result.fieldErrors?.password);
  }

  const inputId = `${id}-password`;
  return (
    <Dialog
      open={open}
      onClose={() => {
        setError(null);
        setFieldError(undefined);
        onCancel();
      }}
      size="sm"
      title="Confirm your password"
      description="Connecting integrations and managing API tokens needs a recent password confirmation (valid for 30 minutes)."
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Field id={inputId} label="Password" error={fieldError}>
          <Input id={inputId} name="password" type="password" autoComplete="current-password" required autoFocus {...describedBy(inputId, { error: fieldError })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Confirm
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
