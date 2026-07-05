import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: "border border-emerald-200/70 bg-gradient-to-r from-emerald-300 to-cyan-300 text-slate-950 shadow-[0_10px_30px_rgba(16,185,129,0.20)] hover:-translate-y-0.5 hover:from-emerald-200 hover:to-cyan-200",
  secondary: "border border-white/10 bg-white/[0.06] text-slate-100 shadow-sm hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.1]",
  ghost: "border border-white/10 bg-transparent text-slate-300 hover:border-emerald-300/30 hover:bg-emerald-300/10 hover:text-white"
};

export const Button = ({ variant = "secondary", className = "", ...props }: ButtonProps) => {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
};
