import type { HTMLAttributes, PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  className?: string;
}> & HTMLAttributes<HTMLElement>;

export const Card = ({ title, subtitle, className = "", children, ...props }: CardProps) => {
  return (
    <section className={`rounded-[22px] border border-white/[0.08] bg-white/[0.035] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-5 ${className}`} {...props}>
      {title ? <h3 className="text-sm font-semibold text-slate-100">{title}</h3> : null}
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      <div className={title || subtitle ? "mt-4" : ""}>{children}</div>
    </section>
  );
};
