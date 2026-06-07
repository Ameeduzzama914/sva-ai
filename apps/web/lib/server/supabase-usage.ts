import { randomUUID } from "crypto";
import type { UserPlan } from "./store";
import { getPlanDailyVerificationLimit } from "./plan-limits";
import { getSupabaseAdminClient } from "./supabase-admin";

type VerificationMode = "fast" | "deep" | "research";

type QuotaResult =
  | { ok: true; usedToday: number; dailyLimit: number; creditsRemaining: number; plan: UserPlan }
  | { ok: false; usedToday: number; dailyLimit: number; creditsRemaining: number; plan: UserPlan };

type Row = Record<string, unknown>;

const isUserPlan = (value: unknown): value is UserPlan =>
  value === "free" || value === "pro" || value === "ultra";

const pickNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return fallback;
};

export const consumeSupabaseDailyVerificationQuota = async (
  userId: string,
  creditsUsed: number
): Promise<QuotaResult | null> => {
  const client = getSupabaseAdminClient();
  if (!client || !userId) return null;

  const { data: row, error: readError } = await client
    .from("sva_users")
    .select("user_id, id, plan, usage_count, daily_usage, monthly_usage, credits_remaining")
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();

  if (readError || !row) {
    if (readError) console.error("[supabase-usage] read user:", readError.message);
    return null;
  }

  const record = row as Row;
  const plan = isUserPlan(record.plan) ? record.plan : "free";
  const dailyLimit = getPlanDailyVerificationLimit(plan);
  const usedToday = pickNumber(record.daily_usage);
  const creditsRemaining = pickNumber(record.credits_remaining, dailyLimit);

  if (usedToday >= dailyLimit || creditsRemaining < creditsUsed) {
    return { ok: false, usedToday, dailyLimit, creditsRemaining, plan };
  }

  const nextDailyUsage = usedToday + 1;
  const nextMonthlyUsage = pickNumber(record.monthly_usage) + 1;
  const nextUsageCount = pickNumber(record.usage_count) + 1;
  const nextCreditsRemaining = Math.max(0, creditsRemaining - creditsUsed);

  const { data: updated, error: updateError } = await client
    .from("sva_users")
    .update({
      daily_usage: nextDailyUsage,
      monthly_usage: nextMonthlyUsage,
      usage_count: nextUsageCount,
      credits_remaining: nextCreditsRemaining,
      updated_at: new Date().toISOString()
    })
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .select("plan, daily_usage, credits_remaining")
    .maybeSingle();

  if (updateError) {
    console.error("[supabase-usage] update quota:", updateError.message);
    return null;
  }

  const updatedRow = (updated ?? {}) as Row;
  return {
    ok: true,
    usedToday: pickNumber(updatedRow.daily_usage, nextDailyUsage),
    dailyLimit,
    creditsRemaining: pickNumber(updatedRow.credits_remaining, nextCreditsRemaining),
    plan
  };
};

export const insertSupabaseVerificationLog = async (input: {
  userId: string;
  email: string;
  query: string;
  mode: VerificationMode;
  confidence: number;
  verdict: string;
  plan: UserPlan;
  status: string;
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const { error } = await client.from("verification_logs").insert({
    id: randomUUID(),
    user_id: input.userId,
    email: input.email,
    query: input.query,
    mode: input.mode,
    confidence: input.confidence,
    trust_score: input.confidence,
    verdict: input.verdict,
    status: input.status,
    plan: input.plan,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error("[supabase-usage] insert verification log:", error.message);
    return false;
  }

  return true;
};
