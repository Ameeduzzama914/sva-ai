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

export const AdminSystemHealth = ({ health }: AdminSystemHealthProps) => (
  <AdminSection title="Provider & system health" subtitle="Environment configuration scan — live when admin API is connected.">
    {!health ? (
      <p className="text-sm text-slate-400">Pending real analytics — connect admin server session to load health.</p>
    ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {health.providers.map((provider) => (
          <div
            key={provider.name}
            className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <ProviderLogo provider={provider.name} size="sm" />
                <p className="truncate text-sm font-medium text-slate-100">{provider.name}</p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${statusStyles[provider.status]}`}
              >
                {statusLabel[provider.status]}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{provider.detail}</p>
          </div>
        ))}
      </div>
    )}
  </AdminSection>
);
