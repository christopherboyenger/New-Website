import { cn } from "@/lib/cn";

/** Large dollar figure with smaller cents ("$0" + ".00"), from integer cents. */
export function MoneyFigure({ cents, className }: { cents: number; className?: string }) {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  const dot = formatted.lastIndexOf(".");
  return (
    <span className={cn("inline-flex items-baseline font-semibold tracking-tight text-ink tabular-nums", className)}>
      <span className="text-[32px] leading-10">{formatted.slice(0, dot)}</span>
      <span className="text-lg text-muted">{formatted.slice(dot)}</span>
    </span>
  );
}

/** Signed ledger amount for tables: "+$25.00" / "−$10.00". */
export function formatSignedCents(cents: number): string {
  const abs = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(cents) / 100);
  return cents < 0 ? `−${abs}` : abs;
}
