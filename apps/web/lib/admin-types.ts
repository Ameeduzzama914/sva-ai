import type {
  AdminFeedbackRecord,
  AdminOverviewStats,
  AdminUserRecord,
  AdminVerificationLog,
  UserPlan
} from "./server/store";
import type { PaymentRecord } from "./server/payments";

export type { AdminFeedbackRecord, AdminOverviewStats, AdminUserRecord, AdminVerificationLog, PaymentRecord };

export type AdminHealthStatus = "healthy" | "pending" | "issue";

export type AdminProviderHealth = {
  name: string;
  status: AdminHealthStatus;
  detail: string;
};

export type AdminHealthPayload = {
  providers: AdminProviderHealth[];
  dataSource: "live" | "placeholder";
};

export type AdminUsersResponse = {
  ok: true;
  users: AdminUserRecord[];
  canManagePlans: boolean;
};

export type AdminOverviewResponse = {
  ok: true;
  overview: AdminOverviewStats;
  pendingLabel: string | null;
};

export type AdminFeedbackResponse = {
  ok: true;
  feedback: AdminFeedbackRecord[];
  emptyMessage: string | null;
};

export type AdminLogsResponse = {
  ok: true;
  logs: AdminVerificationLog[];
  emptyMessage: string | null;
};

export type AdminPaymentsResponse = {
  ok: true;
  payments: PaymentRecord[];
  summary: {
    totalPayments: number;
    totalRevenue: number;
    proUpgrades: number;
    ultraUpgrades: number;
    failedPayments: number;
  };
  emptyMessage: string | null;
};

export type AdminPlanUpdateBody = {
  plan: UserPlan;
};
