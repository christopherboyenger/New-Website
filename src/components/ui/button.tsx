import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "navy";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";

const variants: Record<ButtonVariant, string> = {
  /** Dashboard primary: near-black on stone. */
  primary: "bg-ink text-white hover:bg-ink-2",
  /** Brand accent (marketing CTAs, onboarding intro). */
  accent: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-ink hover:bg-hover",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
  danger: "bg-danger text-white hover:bg-red-800",
  /** Onboarding Next/Finish. */
  navy: "bg-navy text-white hover:bg-navy-2",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-[8px] px-3 text-[13px]",
  md: "h-9 rounded-[8px] px-3.5 text-sm",
  lg: "h-11 rounded-[10px] px-5 text-[15px]",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
