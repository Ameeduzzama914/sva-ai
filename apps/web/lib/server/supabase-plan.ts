import { getSvaPlan } from "../plans";
import type { PublicUser, UserPlan } from "./store";
import { getSupabaseAdminClient } from "./supabase-admin";

const FOUNDER_EMAIL = "mohammed.ameeduzzama@gmail.com";

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

const nextDailyResetAt = (): string => {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
};

const nextBillingPeriodEnd = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), 0, 0, 0)).toISOString();
};

const mapPublicUserRow = (row: Row): PublicUser | null => {
  const email = pickString(row, ["email"]).trim().toLowerCase();
  if (!email) return null;

  const rawPlan = pickString(row, ["plan"]) || "free";
  const plan: UserPlan = email === FOUNDER_EMAIL ? "ultra" : isUserPlan(rawPlan) ? rawPlan : "free";
  const dailyLimit = getSvaPlan(plan).dailyVerificationLimit;
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
    creditsRemaining: pickNumber(row, ["credits_remaining", "creditsRemaining"], Math.max(0, dailyLimit - usedToday)),
    creditsResetAt: toIsoString(pickString(row, ["credits_reset_at", "creditsResetAt"]) || nextDailyResetAt()),
    monthlyUsage: pickNumber(row, ["monthly_usage", "monthlyUsage"]),
    dailyUsage: usedToday
  };
};

export const updateSupabasePaidPlanByEmail = async (email: string, plan: Exclude<UserPlan, "free">): Promise<PublicUser | null> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  if (!client || !normalizedEmail) return null;

  const planConfig = getSvaPlan(plan);
  const now = new Date().toISOString();
  const dailyResetAt = nextDailyResetAt();
  const billingPeriodEnd = nextBillingPeriodEnd();

  const userPayload = {
    plan,
    credits_remaining: planConfig.dailyVerificationLimit,
    credits_reset_at: dailyResetAt,
    billing_period_start: now,
    billing_period_end: billingPeriodEnd,
    daily_usage: 0,
    monthly_usage: 0,
    status: "active",
    updated_at: now
  };

  const existingUser = await client
    .from("sva_users")
    .select("*")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (existingUser.error || !existingUser.data) {
    console.error("[supabase-plan] find paid plan user:", existingUser.error?.message ?? "No matching durable SVA user row.");
    return null;
  }

  const row = existingUser.data as Row;
  const userId = pickString(row, ["user_id", "id"]);
  if (userId) {
    const subscriptionResult = await client.from("subscriptions").upsert(
      {
        user_id: userId,
        plan,
        status: "active",
        current_period_start: now,
        current_period_end: billingPeriodEnd,
        cancellation_at_period_end: false,
        updated_at: now
      },
      { onConflict: "user_id" }
    );

    if (subscriptionResult.error) {
      console.error("[supabase-plan] upsert subscription:", subscriptionResult.error.message);
      return null;
    }

    const balanceResult = await client.from("usage_balances").upsert(
      {
        user_id: userId,
        plan,
        daily_limit: planConfig.dailyVerificationLimit,
        daily_used: 0,
        monthly_limit: planConfig.monthlyVerificationLimit,
        monthly_used: 0,
        daily_reset_at: dailyResetAt,
        billing_period_start: now,
        billing_period_end: billingPeriodEnd,
        active_verifications: 0,
        updated_at: now
      },
      { onConflict: "user_id" }
    );

    if (balanceResult.error) {
      console.error("[supabase-plan] upsert usage balance:", balanceResult.error.message);
      return null;
    }
  } else {
    console.error("[supabase-plan] paid plan update returned no durable user id.");
    return null;
  }

  const userUpdate = await client
    .from("sva_users")
    .update(userPayload)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (userUpdate.error || !userUpdate.data) {
    console.error("[supabase-plan] update paid plan:", userUpdate.error?.message ?? "Durable SVA user update returned no row.");
    return null;
  }

  const [confirmedUser, confirmedSubscription, confirmedBalance] = await Promise.all([
    client.from("sva_users").select("*").eq("user_id", userId).maybeSingle(),
    client.from("subscriptions").select("plan, status").eq("user_id", userId).maybeSingle(),
    client.from("usage_balances").select("plan, daily_limit, monthly_limit").eq("user_id", userId).maybeSingle()
  ]);
  const confirmedUserRow = confirmedUser.data as Row | null;
  const confirmedPlan = confirmedUserRow ? pickString(confirmedUserRow, ["plan"]) : "";
  const entitlementConfirmed =
    !confirmedUser.error &&
    !confirmedSubscription.error &&
    !confirmedBalance.error &&
    confirmedPlan === plan &&
    confirmedSubscription.data?.plan === plan &&
    confirmedSubscription.data?.status === "active" &&
    confirmedBalance.data?.plan === plan &&
    confirmedBalance.data?.daily_limit === planConfig.dailyVerificationLimit &&
    confirmedBalance.data?.monthly_limit === planConfig.monthlyVerificationLimit;

  if (!entitlementConfirmed || !confirmedUserRow) {
    console.error("[supabase-plan] durable paid entitlement confirmation failed.", {
      plan,
      userConfigured: Boolean(confirmedUser.data),
      subscriptionConfigured: Boolean(confirmedSubscription.data),
      usageBalanceConfigured: Boolean(confirmedBalance.data)
    });
    return null;
  }

  return mapPublicUserRow(confirmedUserRow);
};

export const renewSupabasePaidPlan = async (input: {
  userId?: string;
  email: string;
  plan: Exclude<UserPlan, "free">;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  cancellationAtPeriodEnd?: boolean;
  subscriptionStatus?: "active" | "cancel_at_period_end" | "halted" | "cancelled";
}): Promise<PublicUser | null> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!client || !normalizedEmail) return null;

  const planConfig = getSvaPlan(input.plan);
  const now = new Date().toISOString();
  const periodStart = input.billingPeriodStart ? toIsoString(input.billingPeriodStart) : now;
  const periodEnd = input.billingPeriodEnd ? toIsoString(input.billingPeriodEnd) : nextBillingPeriodEnd();

  const { data, error } = await client
    .from("sva_users")
    .upsert(
      {
        email: normalizedEmail,
        plan: input.plan,
        daily_limit: planConfig.dailyVerificationLimit,
        monthly_limit: planConfig.monthlyVerificationLimit,
        monthly_usage: 0,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        status: input.subscriptionStatus === "halted" ? "past_due" : "active",
        updated_at: now
      },
      { onConflict: "email" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[supabase-plan] renew paid plan:", error.message);
    return null;
  }

  const row = data as Row;
  const userId = input.userId || pickString(row, ["user_id", "id"]);
  if (userId) {
    const subscriptionResult = await client.from("subscriptions").upsert(
      {
        user_id: userId,
        plan: input.plan,
        status: input.subscriptionStatus === "halted" ? "halted" : "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancellation_at_period_end: Boolean(input.cancellationAtPeriodEnd),
        updated_at: now
      },
      { onConflict: "user_id" }
    );
    if (subscriptionResult.error) console.error("[supabase-plan] renew subscription:", subscriptionResult.error.message);

    const balanceResult = await client.from("usage_balances").upsert(
      {
        user_id: userId,
        plan: input.plan,
        daily_limit: planConfig.dailyVerificationLimit,
        monthly_limit: planConfig.monthlyVerificationLimit,
        monthly_used: 0,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        updated_at: now
      },
      { onConflict: "user_id" }
    );
    if (balanceResult.error) console.error("[supabase-plan] renew usage balance:", balanceResult.error.message);
  }

  return mapPublicUserRow(row);
};

export const markSupabaseSubscriptionCancellation = async (input: {
  userId?: string;
  email: string;
  plan: Exclude<UserPlan, "free">;
  billingPeriodEnd?: string;
  cancellationAtPeriodEnd: boolean;
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!client || !normalizedEmail) return false;
  const now = new Date().toISOString();
  const periodEnd = input.billingPeriodEnd ? toIsoString(input.billingPeriodEnd) : undefined;

  const userUpdate = await client
    .from("sva_users")
    .update({ status: input.cancellationAtPeriodEnd ? "cancel_at_period_end" : "cancelled", ...(periodEnd ? { billing_period_end: periodEnd } : {}), updated_at: now })
    .eq("email", normalizedEmail);
  if (userUpdate.error) console.error("[supabase-plan] cancellation user update:", userUpdate.error.message);

  const userId = input.userId;
  if (userId) {
    const subscriptionUpdate = await client
      .from("subscriptions")
      .update({ status: input.cancellationAtPeriodEnd ? "cancel_at_period_end" : "cancelled", cancellation_at_period_end: input.cancellationAtPeriodEnd, ...(periodEnd ? { current_period_end: periodEnd } : {}), updated_at: now })
      .eq("user_id", userId);
    if (subscriptionUpdate.error) console.error("[supabase-plan] cancellation subscription update:", subscriptionUpdate.error.message);
  }

  return !userUpdate.error;
};

