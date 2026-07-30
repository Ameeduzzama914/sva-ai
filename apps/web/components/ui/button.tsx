import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: "border border-emerald-200/60 bg-emerald-300 text-[#042016] shadow-[0_10px_30px_rgba(16,185,129,0.16)] hover:-translate-y-0.5 hover:bg-emerald-200",
  secondary: "border border-white/[0.09] bg-white/[0.045] text-slate-100 shadow-sm hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.075]",
  ghost: "border border-transparent bg-transparent text-slate-400 hover:bg-white/[0.045] hover:text-white",
  destructive: "border border-rose-300/25 bg-rose-400/10 text-rose-200 hover:border-rose-300/40 hover:bg-rose-400/15"
};

export const Button = ({ variant = "secondary", className = "", ...props }: ButtonProps) => {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070a] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
};
