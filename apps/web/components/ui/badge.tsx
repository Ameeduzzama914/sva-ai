import type { PropsWithChildren } from "react";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "violet" | "indigo" | "cyan";

type BadgeProps = PropsWithChildren<{
  variant?: BadgeVariant;
  className?: string;
}>;

const badgeVariantClass: Record<BadgeVariant, string> = {
  neutral: "border-slate-500/40 bg-slate-500/20 text-slate-200",
  success: "border-emerald-500/40 bg-emerald-500/20 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/20 text-amber-300",
  danger: "border-rose-500/40 bg-rose-500/20 text-rose-300",
  violet: "border-violet-400/40 bg-violet-500/10 text-violet-200",
  indigo: "border-indigo-500/40 bg-indigo-500/20 text-indigo-200",
  cyan: "border-cyan-500/40 bg-cyan-500/20 text-cyan-200"
};

export const Badge = ({ variant = "neutral", className = "", children }: BadgeProps) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeVariantClass[variant]} ${className}`}>{children}</span>
);
