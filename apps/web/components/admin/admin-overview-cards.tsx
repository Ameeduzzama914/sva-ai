import type { AdminOverviewStats } from "../../lib/admin-types";
import { Card } from "../ui/card";

type MetricCard = {
  title: string;
  value: string | number;
  hint: string;
  icon: string;
};

type AdminOverviewCardsProps = {
  overview: AdminOverviewStats | null;
  pendingLabel: string | null;
  apiConnected: boolean;
};

const healthLabel: Record<AdminOverviewStats["systemHealth"], string> = {
  healthy: "Healthy",
  warning: "Warning",
  issue: "Issue"
};

export const AdminOverviewCards = ({ overview, pendingLabel, apiConnected }: AdminOverviewCardsProps) => {
  const placeholder = !apiConnected || overview?.dataSource === "empty";
  const hint = placeholder ? "Pending real analytics" : "Live server datastore";

  const metrics: MetricCard[] = [
    { title: "Total Users", value: overview?.totalUsers ?? "—", hint, icon: "👥" },
    { title: "New Users Today", value: overview?.newUsersToday ?? "—", hint, icon: "✨" },
    { title: "Total Verifications", value: overview?.totalVerifications ?? "—", hint, icon: "📊" },
    { title: "Verifications Today", value: overview?.verificationsToday ?? "—", hint, icon: "✓" },
    { title: "Free Users", value: overview?.freeUsers ?? "—", hint, icon: "F" },
    { title: "Pro Users", value: overview?.proUsers ?? "—", hint, icon: "P" },
    { title: "Ultra Users", value: overview?.ultraUsers ?? "—", hint, icon: "U" },
    { title: "Feedback Count", value: overview?.feedbackCount ?? "—", hint, icon: "★" },
    {
      title: "System Health",
      value: overview ? healthLabel[overview.systemHealth] : "—",
      hint: overview ? "Provider configuration scan" : hint,
      icon: "◉"
    }
  ];

  return (
    <div className="space-y-3">
      {pendingLabel ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">{pendingLabel}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card
            key={metric.title}
            className="group border-slate-800/80 bg-slate-950/60 backdrop-blur-sm transition hover:border-violet-500/40 hover:shadow-[0_0_28px_rgba(139,92,246,0.12)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{metric.title}</p>
                <p className="mt-2 truncate text-2xl font-semibold text-slate-50 sm:text-3xl">{metric.value}</p>
                <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
              </div>
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-sm font-semibold text-violet-200"
                aria-hidden
              >
                {metric.icon}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
