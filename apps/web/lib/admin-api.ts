import type {
  AdminFeedbackResponse,
  AdminHealthPayload,
  AdminLogsResponse,
  AdminOverviewResponse,
  AdminPaymentsResponse,
  AdminPlanUpdateBody,
  AdminUsersResponse
} from "./admin-types";
import { getSession } from "./client-auth";
import type { UserPlan } from "./server/store";

const ADMIN_EMAIL_HEADER = "x-sva-admin-email";

const adminFetch = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
  const sessionEmail = typeof window !== "undefined" ? getSession()?.email : undefined;
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(sessionEmail ? { [ADMIN_EMAIL_HEADER]: sessionEmail } : {}),
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
