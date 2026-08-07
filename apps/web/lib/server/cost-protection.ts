import type { RuntimeProviderStatus } from "../models";
import type { PlanId } from "../plans";
import { createAdminAlert } from "./admin-alerts";
import { getSupabaseAdminClient } from "./supabase-admin";

const DEFAULT_USD_TO_INR = 83;
const INR_THRESHOLDS: Record<Exclude<PlanId, "free">, { warning: number; critical: number }> = {
  pro: { warning: 180, critical: 240 },
  ultra: { warning: 400, critical: 520 }
};

const budgetRate = (): number => {
  const value = Number(process.env.SVA_BUDGET_USD_TO_INR);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_USD_TO_INR;
};

export const providerCostUsd = (statuses: RuntimeProviderStatus[]): number =>
  statuses.reduce((sum, status) => sum + (typeof status.costUsd === "number" && Number.isFinite(status.costUsd) ? status.costUsd : 0), 0);

const hasUnresolvedAlert = async (alertType: string, userId: string): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  const { data, error } = await client.from("admin_alerts").select("id").eq("alert_type", alertType).eq("resolved", false).contains("metadata", { user_id: userId }).limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
};

export const evaluateProfitProtection = async (input: {
  userId: string;
  plan: PlanId;
  verificationId: string;
  verificationCostUsd: number;
  complexity: "simple" | "normal" | "complex";
}): Promise<{ costInr: number; threshold?: "warning" | "critical" }> => {
  if (input.plan === "free") return { costInr: input.verificationCostUsd * budgetRate() };
  const costInr = input.verificationCostUsd * budgetRate();
  const thresholds = INR_THRESHOLDS[input.plan];
  const threshold = costInr >= thresholds.critical ? "critical" : costInr >= thresholds.warning ? "warning" : undefined;
  if (!threshold) return { costInr };

  const alertType = `ai_cost_${threshold}`;
  if (await hasUnresolvedAlert(alertType, input.userId)) return { costInr, threshold };

  await createAdminAlert({
    alertType,
    severity: threshold === "critical" ? "critical" : "warning",
    source: "profit_protection",
    message: threshold === "critical" ? "Verification AI cost crossed the critical threshold." : "Verification AI cost crossed the warning threshold.",
    metadata: {
      user_id: input.userId,
      plan: input.plan,
      verification_id: input.verificationId,
      complexity: input.complexity,
      cost_usd: input.verificationCostUsd,
      cost_inr: Math.round(costInr * 100) / 100
    }
  });

  const client = getSupabaseAdminClient();
  if (client) await client.from("usage_balances").update({ abnormal_usage_flagged: true, updated_at: new Date().toISOString() }).eq("user_id", input.userId);
  return { costInr, threshold };
};
