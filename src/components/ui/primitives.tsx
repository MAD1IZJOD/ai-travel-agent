import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "md" | "lg" | "sm";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-lagoon text-white hover:bg-[#0c4e4b] active:bg-[#0a4240] disabled:bg-line-strong disabled:text-ink-faint",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-ink-faint hover:bg-surface-muted disabled:text-ink-faint",
  ghost: "text-ink-soft hover:text-ink hover:bg-surface-muted disabled:text-ink-faint",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(29,27,24,0.04)]", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "lagoon" | "clay" | "ok" | "warn" | "bad";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-soft",
  lagoon: "bg-lagoon-soft text-lagoon",
  clay: "bg-clay-soft text-clay",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-ink-faint uppercase">{eyebrow}</p>
        )}
        <h2 className="font-display text-2xl text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}
