import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-violet-500 text-white hover:bg-violet-400 border border-violet-400 shadow-[0_0_30px_rgba(139,92,246,0.25)]",
  secondary: "bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700",
  ghost: "bg-transparent text-slate-300 border border-slate-700 hover:bg-slate-800"
};

export const Button = ({ variant = "secondary", className = "", ...props }: ButtonProps) => {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
};
