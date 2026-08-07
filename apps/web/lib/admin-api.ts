import type {
  AdminFeedbackResponse,
  AdminHealthPayload,
  AdminLogsResponse,
  AdminOverviewResponse,
  AdminPaymentsResponse,
  AdminPlanUpdateBody,
  AdminUsersResponse
} from "./admin-types";
import type { UserPlan } from "./server/store";

const adminFetch = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
};

export const fetchAdminOverview = () => adminFetch<AdminOverviewResponse>("/api/admin/overview");

export const fetchAdminUsers = () => adminFetch<AdminUsersResponse>("/api/admin/users");

export const fetchAdminFeedback = () => adminFetch<AdminFeedbackResponse>("/api/admin/feedback");

export const fetchAdminLogs = () => adminFetch<AdminLogsResponse>("/api/admin/logs");

export const fetchAdminPayments = () => adminFetch<AdminPaymentsResponse>("/api/admin/payments");

export const fetchAdminHealth = () => adminFetch<{ ok: true; health: AdminHealthPayload }>("/api/admin/health");

export const updateAdminUserPlan = (userId: string, plan: UserPlan) =>
  adminFetch<{ ok: true }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ plan } satisfies AdminPlanUpdateBody)
  });

export const resetAdminUserUsage = (userId: string) =>
  adminFetch<{ ok: true }>(`/api/admin/users/${userId}/reset-usage`, { method: "POST" });

export const fetchAdminMetrics = () => adminFetch<{ ok: true; metrics: Record<string, any> }>("/api/admin/metrics");

