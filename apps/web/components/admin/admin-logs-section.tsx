import type { AdminVerificationLog } from "../../lib/admin-types";
import { Badge } from "../ui/badge";
import { AdminSection } from "./admin-section";

type AdminLogsSectionProps = {
  logs: AdminVerificationLog[];
  emptyMessage: string | null;
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export const AdminLogsSection = ({ logs, emptyMessage }: AdminLogsSectionProps) => (
  <AdminSection title="Verification logs" subtitle="Recent verification activity from per-user server history.">
    {emptyMessage && logs.length === 0 ? (
      <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-400">{emptyMessage}</p>
    ) : (
      <div className="space-y-3">
        {logs.map((log) => (
          <article
            key={log.id}
            className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-violet-200">{log.email}</p>
              <p className="text-xs text-slate-500">{formatDate(log.timestamp)}</p>
            </div>
            <p className="mt-2 text-sm text-slate-200">{log.query}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="indigo">{log.mode} mode</Badge>
              <Badge variant="neutral">{log.modelsUsed}</Badge>
              <Badge variant="success">Trust {log.trustScore}</Badge>
              <Badge variant={log.status === "failed" ? "danger" : "warning"}>{log.status}</Badge>
            </div>
          </article>
        ))}
      </div>
    )}
  </AdminSection>
);
