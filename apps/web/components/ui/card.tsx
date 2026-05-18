import type { HTMLAttributes, PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  className?: string;
}> & HTMLAttributes<HTMLElement>;

export const Card = ({ title, subtitle, className = "", children, ...props }: CardProps) => {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 ${className}`} {...props}>
      {title ? <h3 className="text-sm font-semibold text-slate-100">{title}</h3> : null}
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      <div className={title || subtitle ? "mt-4" : ""}>{children}</div>
    </section>
  );
};
