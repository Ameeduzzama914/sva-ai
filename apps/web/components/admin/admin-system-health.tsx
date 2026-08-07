import type { AdminHealthPayload, AdminHealthStatus } from "../../lib/admin-types";
import { ProviderLogo } from "../provider-logo";
import { AdminSection } from "./admin-section";

type AdminSystemHealthProps = {
  health: AdminHealthPayload | null;
};

const statusStyles: Record<AdminHealthStatus, string> = {
  healthy: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  pending: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  issue: "bg-rose-500/20 text-rose-300 border-rose-500/40"
};

const statusLabel: Record<AdminHealthStatus, string> = {
  healthy: "Healthy",
  pending: "Pending",
  issue: "Issue"
};

const openRouterHealthLabel = (status: AdminHealthPayload["openRouter"]["status"]): AdminHealthStatus => {
  if (status === "critical" || status === "not_configured") return "issue";
  if (status === "warning" || status === "unknown") return "pending";
  return "healthy";
};

export const AdminSystemHealth = ({ health }: AdminSystemHealthProps) => (
  <AdminSection title="Provider & system health" subtitle="Central OpenRouter account health, model-family routing, and retrieval configuration.">
    {!health ? (
      <p className="text-sm text-slate-400">Pending real analytics. Connect admin server session to load health.</p>
    ) : (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-100">OpenRouter central balance</p>
              <p className="mt-1 text-xs text-slate-400">{health.openRouter.message}</p>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${statusStyles[openRouterHealthLabel(health.openRouter.status)]}`}>
              {health.openRouter.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
            <p>Balance: {health.openRouter.balanceUsd === null ? "Unavailable" : `$${health.openRouter.balanceUsd.toFixed(2)}`}</p>
            <p>Warning: {health.openRouter.warningThresholdUsd === null ? "Not configured" : `$${health.openRouter.warningThresholdUsd.toFixed(2)}`}</p>
            <p>Critical: {health.openRouter.criticalThresholdUsd === null ? "Not configured" : `$${health.openRouter.criticalThresholdUsd.toFixed(2)}`}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {health.providers.map((provider) => (
            <div key={provider.name} className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderLogo provider={provider.name} size="sm" />
                  <p className="truncate text-sm font-medium text-slate-100">{provider.name}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${statusStyles[provider.status]}`}>
                  {statusLabel[provider.status]}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">{provider.detail}</p>
            </div>
          ))}
        </div>
      </div>
    )}
  </AdminSection>
);
