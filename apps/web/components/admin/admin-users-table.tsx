"use client";

import { useMemo, useState } from "react";
import {
  fetchAdminUsers,
  resetAdminUserUsage,
  updateAdminUserPlan
} from "../../lib/admin-api";
import type { AdminUserRecord } from "../../lib/admin-types";
import type { UserPlan } from "../../lib/server/store";
import { Button } from "../ui/button";
import { PlanBadge, StatusBadge } from "./admin-plan-badges";
import { AdminSection } from "./admin-section";

type PlanFilter = "all" | UserPlan;

type AdminUsersTableProps = {
  initialUsers: AdminUserRecord[];
  canManagePlans: boolean;
  onRefresh: () => Promise<void>;
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export const AdminUsersTable = ({ initialUsers, canManagePlans, onRefresh }: AdminUsersTableProps) => {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesPlan = planFilter === "all" || user.plan === planFilter;
      const matchesSearch = !query || user.email.toLowerCase().includes(query);
      return matchesPlan && matchesSearch;
    });
  }, [users, search, planFilter]);

  const runAction = async (userId: string, action: () => Promise<unknown>) => {
    if (!canManagePlans) {
      return;
    }
    setBusyUserId(userId);
    setMessage(null);
    const result = await action();
    if (!result) {
      setMessage("Action failed. Ensure you are signed in with a server session.");
    } else {
      const refreshed = await fetchAdminUsers();
      if (refreshed?.users) {
        setUsers(refreshed.users);
      }
      await onRefresh();
      setMessage("User updated.");
    }
    setBusyUserId(null);
  };

  return (
    <AdminSection
      title="User management"
      subtitle="Search, filter, and safely adjust plans or usage for server-backed accounts."
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none ring-violet-400 focus:ring-2"
          placeholder="Search by email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
        >
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="ultra">Ultra</option>
        </select>
      </div>

      {message ? <p className="mb-3 text-xs text-emerald-300">{message}</p> : null}
      {!canManagePlans ? (
        <p className="mb-3 text-xs text-amber-200">Plan actions require a server-authenticated admin session.</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3">Daily Usage</th>
              <th className="px-3 py-3">Total Verifications</th>
              <th className="px-3 py-3">Joined</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  No users match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr key={user.userId} className="border-t border-slate-800/80 text-slate-200">
                  <td className="max-w-[220px] truncate px-3 py-3">{user.email}</td>
                  <td className="px-3 py-3">
                    <PlanBadge plan={user.plan} />
                  </td>
                  <td className="px-3 py-3">{user.dailyUsage}</td>
                  <td className="px-3 py-3">{user.totalVerifications}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{formatDate(user.joinedDate)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-[280px] flex-wrap gap-1">
                      {(["free", "pro", "ultra"] as UserPlan[]).map((plan) => (
                        <Button
                          key={plan}
                          variant="ghost"
                          className="px-2 py-1 text-[11px]"
                          disabled={!canManagePlans || busyUserId === user.userId}
                          onClick={() => runAction(user.userId, () => updateAdminUserPlan(user.userId, plan))}
                        >
                          Set {plan === "ultra" ? "Ultra" : plan === "pro" ? "Pro" : "Free"}
                        </Button>
                      ))}
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-[11px]"
                        disabled={!canManagePlans || busyUserId === user.userId}
                        onClick={() => runAction(user.userId, () => resetAdminUserUsage(user.userId))}
                      >
                        Reset Usage
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
};
