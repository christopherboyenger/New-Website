import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Card-style single choice built on native radio inputs, so arrow keys,
 * Tab order, form submission and screen-reader semantics work without JS.
 * Selection is shown with a stronger outline + pale fill (reference style).
 */
export interface ChoiceOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
}

export interface ChoiceCardGroupProps {
  name: string;
  legend: ReactNode;
  legendHidden?: boolean;
  options: ChoiceOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  columns?: 1 | 2 | 3 | 4 | 5;
  tone?: "navy" | "accent" | "ink";
  required?: boolean;
  className?: string;
}

const toneSelected: Record<NonNullable<ChoiceCardGroupProps["tone"]>, string> = {
  navy: "has-[:checked]:border-navy has-[:checked]:bg-slate-fill has-[:checked]:ring-1 has-[:checked]:ring-navy",
  accent: "has-[:checked]:border-accent has-[:checked]:ring-1 has-[:checked]:ring-accent",
  ink: "has-[:checked]:border-ink has-[:checked]:bg-canvas has-[:checked]:ring-1 has-[:checked]:ring-ink",
};

const gridCols: Record<NonNullable<ChoiceCardGroupProps["columns"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

export function ChoiceCardGroup({
  name,
  legend,
  legendHidden,
  options,
  value,
  defaultValue,
  onChange,
  columns = 2,
  tone = "navy",
  required,
  className,
}: ChoiceCardGroupProps) {
  const controlled = value !== undefined;
  return (
    <fieldset className={className}>
      <legend className={cn("mb-3 text-sm font-medium text-ink", legendHidden && "sr-only")}>{legend}</legend>
      <div className={cn("grid gap-3", gridCols[columns])}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "group relative flex cursor-pointer flex-col gap-1 rounded-[12px] border border-slate-line bg-surface p-4 transition-colors hover:border-line-strong",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
              "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              toneSelected[tone],
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              className="sr-only"
              disabled={option.disabled}
              required={required}
              {...(controlled ? { checked: value === option.value } : { defaultChecked: defaultValue === option.value })}
              onChange={onChange ? () => onChange(option.value) : undefined}
            />
            {option.media}
            <span className="flex items-center gap-2 text-[15px] font-semibold text-navy">
              {option.label}
              {option.badge}
            </span>
            {option.description ? <span className="text-sm text-slate-help">{option.description}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
