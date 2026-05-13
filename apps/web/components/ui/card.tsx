import type { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  className?: string;
}>;

export const Card = ({ title, subtitle, className = "", children }: CardProps) => {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/80 p-5 ${className}`}>
      {title ? <h3 className="text-sm font-semibold text-slate-100">{title}</h3> : null}
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      <div className={title || subtitle ? "mt-4" : ""}>{children}</div>
    </section>
  );
};
