"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminFeedback,
  fetchAdminHealth,
  fetchAdminLogs,
  fetchAdminOverview,
  fetchAdminUsers
} from "../../lib/admin-api";
import type {
  AdminFeedbackRecord,
  AdminHealthPayload,
  AdminOverviewStats,
  AdminUserRecord,
  AdminVerificationLog
} from "../../lib/admin-types";
import { AdminFeedbackSection } from "./admin-feedback-section";
import { AdminLogsSection } from "./admin-logs-section";
import { AdminOverviewCards } from "./admin-overview-cards";
import { AdminPlanOverview } from "./admin-plan-overview";
import { AdminSystemHealth } from "./admin-system-health";
import { AdminUsersTable } from "./admin-users-table";

export const AdminDashboard = () => {
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [canManagePlans, setCanManagePlans] = useState(false);
  const [feedback, setFeedback] = useState<AdminFeedbackRecord[]>([]);
  const [feedbackEmpty, setFeedbackEmpty] = useState<string | null>(null);
  const [logs, setLogs] = useState<AdminVerificationLog[]>([]);
  const [logsEmpty, setLogsEmpty] = useState<string | null>(null);
  const [health, setHealth] = useState<AdminHealthPayload | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [overviewRes, usersRes, feedbackRes, logsRes, healthRes] = await Promise.all([
      fetchAdminOverview(),
      fetchAdminUsers(),
      fetchAdminFeedback(),
      fetchAdminLogs(),
      fetchAdminHealth()
    ]);

    const connected = Boolean(overviewRes || usersRes || feedbackRes || logsRes || healthRes);
    setApiConnected(connected);

    if (!connected) {
      setApiNotice(
        "Live admin data requires a server session for the founder account. UI is shown with placeholder metrics until /api/admin/* authorizes your cookie."
      );
    } else {
      setApiNotice(null);
    }

    if (overviewRes) {
      setOverview(overviewRes.overview);
      setPendingLabel(overviewRes.pendingLabel);
    }
    if (usersRes) {
      setUsers(usersRes.users);
      setCanManagePlans(usersRes.canManagePlans);
    }
    if (feedbackRes) {
      setFeedback(feedbackRes.feedback);
      setFeedbackEmpty(feedbackRes.emptyMessage);
    }
    if (logsRes) {
      setLogs(logsRes.logs);
      setLogsEmpty(logsRes.emptyMessage);
    }
    if (healthRes) {
      setHealth(healthRes.health);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="space-y-8">
      {apiNotice ? (
        <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">{apiNotice}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-400">Loading founder analytics…</p> : null}

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-violet-300/90">Overview</h2>
        <AdminOverviewCards overview={overview} pendingLabel={pendingLabel} apiConnected={apiConnected} />
      </section>

      <AdminUsersTable initialUsers={users} canManagePlans={canManagePlans && apiConnected} onRefresh={loadDashboard} />

      <AdminFeedbackSection feedback={feedback} emptyMessage={feedbackEmpty} />

      <AdminLogsSection logs={logs} emptyMessage={logsEmpty} />

      <AdminPlanOverview />

      <AdminSystemHealth health={health} />
    </div>
  );
};
