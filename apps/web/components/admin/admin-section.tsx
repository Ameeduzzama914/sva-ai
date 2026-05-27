import type { PropsWithChildren, ReactNode } from "react";
import { Card } from "../ui/card";

type AdminSectionProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
}>;

export const AdminSection = ({ title, subtitle, action, children }: AdminSectionProps) => (
  <Card className="border-slate-800/80 bg-slate-950/55 backdrop-blur-sm">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-50">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    {children}
  </Card>
);
