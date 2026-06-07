import type { PublicUser, UserPlan } from "./store";
import { getPlanDailyVerificationLimit } from "./plan-limits";
import { getSupabaseAdminClient } from "./supabase-admin";

type Row = Record<string, unknown>;

const isUserPlan = (value: unknown): value is UserPlan =>
  value === "free" || value === "pro" || value === "ultra";

const pickString = (row: Row, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

const pickNumber = (row: Row, keys: string[], fallback = 0): number => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return fallback;
};

const toIsoString = (value: string): string => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const nextResetAt = (plan: UserPlan): string => {
  const now = new Date();
  if (plan === "free") {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.toISOString();
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();
};

const mapPublicUserRow = (row: Row): PublicUser | null => {
  const email = pickString(row, ["email"]).trim().toLowerCase();
  if (!email) return null;

  const rawPlan = pickString(row, ["plan"]) || "free";
  const plan = isUserPlan(rawPlan) ? rawPlan : "free";
  const dailyLimit = getPlanDailyVerificationLimit(plan);
  const usedToday = pickNumber(row, ["daily_usage", "dailyUsage", "usage_today"]);

  return {
    userId: pickString(row, ["user_id", "userId", "id"]) || email,
    email,
    plan,
    usageCount: pickNumber(row, ["usage_count", "usageCount", "total_verifications", "totalVerifications"]),
    createdAt: toIsoString(pickString(row, ["created_at", "createdAt", "joined_date", "joinedDate"])),
    usedToday,
    dailyLimit,
    onboardingCompleted: Boolean(row.onboarding_completed ?? row.onboardingCompleted),
    creditsRemaining: pickNumber(row, ["credits_remaining", "creditsRemaining"], dailyLimit),
    creditsResetAt: toIsoString(pickString(row, ["credits_reset_at", "creditsResetAt"]) || nextResetAt(plan)),
    monthlyUsage: pickNumber(row, ["monthly_usage", "monthlyUsage"]),
    dailyUsage: usedToday
  };
};

export const updateSupabasePaidPlanByEmail = async (email: string, plan: Exclude<UserPlan, "free">): Promise<PublicUser | null> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  if (!client || !normalizedEmail) return null;

  const dailyLimit = getPlanDailyVerificationLimit(plan);
  const { data, error } = await client
    .from("sva_users")
    .update({
      plan,
      daily_limit: dailyLimit,
      credits_remaining: dailyLimit,
      credits_reset_at: nextResetAt(plan),
      daily_usage: 0,
      monthly_usage: 0,
      updated_at: new Date().toISOString()
    })
    .ilike("email", normalizedEmail)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[supabase-plan] update paid plan:", error.message);
    return null;
  }

  return data ? mapPublicUserRow(data as Row) : null;
};
