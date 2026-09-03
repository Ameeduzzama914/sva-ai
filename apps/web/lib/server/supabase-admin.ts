import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminFeedbackRecord,
  AdminOverviewStats,
  AdminUserRecord,
  AdminVerificationLog,
  PublicUser,
  UserPlan
} from "./store";
import { getSvaPlan } from "../plans";

type Row = Record<string, unknown>;

const isUserPlan = (value: unknown): value is UserPlan =>
  value === "free" || value === "pro" || value === "ultra";

const isPaidPlan = (value: unknown): value is Exclude<UserPlan, "free"> =>
  value === "pro" || value === "ultra";

const pickString = (row: Row, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
};

const pickNumber = (row: Row, keys: string[], fallback = 0): number => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return fallback;
};

let adminClient: SupabaseClient | null | undefined;

export const getSupabaseAdminClient = (): SupabaseClient | null => {
  if (adminClient !== undefined) {
    return adminClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    adminClient = null;
    return null;
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return adminClient;
};

export const isSupabaseAdminConfigured = (): boolean => Boolean(getSupabaseAdminClient());

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

const planToModelsLabel = (plan: UserPlan): string => {
  if (plan === "pro" || plan === "ultra") {
    return "GPT, Gemini, DeepSeek";
  }
  return "Mistral, Llama, Gemma";
};

const mapUserRow = (row: Row): AdminUserRecord | null => {
  const userId = pickString(row, ["user_id", "userId", "id"]);
  const email = pickString(row, ["email"]);
  const planRaw = pickString(row, ["plan"]) || "free";
  const plan = isUserPlan(planRaw) ? planRaw : "free";
  const joinedDate = pickString(row, ["created_at", "createdAt", "joined_date", "joinedDate"]);

  if (!userId || !email) {
    return null;
  }

  const dailyUsage = pickNumber(row, ["daily_usage", "dailyUsage", "usage_today"]);
  const totalVerifications = pickNumber(row, ["usage_count", "usageCount", "total_verifications", "totalVerifications"]);
  const lastActivity = pickString(row, ["last_activity_at", "lastActivityAt", "updated_at", "updatedAt"]) || joinedDate;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const status: AdminUserRecord["status"] =
    lastActivity && new Date(lastActivity).getTime() >= weekAgo ? "active" : "idle";

  return {
    userId,
    email,
    plan,
    dailyUsage,
    totalVerifications,
    joinedDate: joinedDate || new Date().toISOString(),
    status
  };
};

const toIsoString = (value: string): string => {
  if (!value) {
    return new Date().toISOString();
  }
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

const planCreditLimit = (plan: UserPlan): number => getSvaPlan(plan).dailyVerificationLimit;

const mapPublicUserRow = (row: Row): PublicUser | null => {
  const email = pickString(row, ["email"]).trim().toLowerCase();
  if (!email) {
    return null;
  }

  const planRaw = pickString(row, ["plan"]) || "free";
  const plan = isUserPlan(planRaw) ? planRaw : "free";
  const userId = pickString(row, ["user_id", "userId", "id"]) || email;
  const usedToday = pickNumber(row, ["daily_usage", "dailyUsage", "usage_today"]);

  return {
    userId,
    email,
    plan,
    usageCount: pickNumber(row, ["usage_count", "usageCount", "total_verifications", "totalVerifications"]),
    createdAt: toIsoString(pickString(row, ["created_at", "createdAt", "joined_date", "joinedDate"])),
    usedToday,
    dailyLimit: planCreditLimit(plan),
    onboardingCompleted: Boolean(row.onboarding_completed ?? row.onboardingCompleted),
    creditsRemaining: pickNumber(row, ["credits_remaining", "creditsRemaining"], planCreditLimit(plan)),
    creditsResetAt: toIsoString(pickString(row, ["credits_reset_at", "creditsResetAt"]) || nextResetAt(plan)),
    monthlyUsage: pickNumber(row, ["monthly_usage", "monthlyUsage"]),
    dailyUsage: usedToday
  };
};

export const fetchPublicUserByEmailFromSupabase = async (email: string): Promise<PublicUser | null> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  if (!client || !normalizedEmail) {
    return null;
  }

  const { data, error } = await client
    .from("sva_users")
    .select("*")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error("[supabase-admin] user by email:", error.message);
    return null;
  }

  return data ? mapPublicUserRow(data as Row) : null;
};

export const fetchPublicUserByIdFromSupabase = async (userId: string): Promise<PublicUser | null> => {
  const client = getSupabaseAdminClient();
  if (!client || !userId) return null;
  const { data, error } = await client.from("sva_users").select("*").or(`user_id.eq.${userId},id.eq.${userId}`).maybeSingle();
  if (error) {
    console.error("[supabase-admin] user by id:", error.message);
    return null;
  }
  return data ? mapPublicUserRow(data as Row) : null;
};

export const resolveEmailRelinkPlan = (
  existingPlan: unknown,
  subscription: { plan?: unknown; status?: unknown; current_period_end?: unknown } | null,
  nowMs = Date.now()
): UserPlan => {
  if (!isPaidPlan(existingPlan)) return "free";
  if (subscription?.plan !== existingPlan) return "free";
  if (subscription.status === "active") return existingPlan;
  if (subscription.status !== "cancel_at_period_end") return "free";
  const periodEnd = typeof subscription.current_period_end === "string" ? Date.parse(subscription.current_period_end) : Number.NaN;
  return Number.isFinite(periodEnd) && periodEnd > nowMs ? existingPlan : "free";
};

export const ensureSupabaseUser = async (userId: string, email: string): Promise<PublicUser | null> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  if (!client || !userId || !normalizedEmail) return null;

  const byId = await fetchPublicUserByIdFromSupabase(userId);
  if (byId) return byId;
  const byEmail = await fetchPublicUserByEmailFromSupabase(normalizedEmail);
  if (byEmail) {
    if (byEmail.userId === userId) return byEmail;
    const subscriptionResult = isPaidPlan(byEmail.plan)
      ? await client.from("subscriptions").select("plan, status, current_period_end").eq("user_id", byEmail.userId).maybeSingle()
      : { data: null, error: null };
    if (subscriptionResult.error) {
      console.error("[supabase-admin] validate paid email relink:", subscriptionResult.error.message);
      return null;
    }
    const linkedPlan = resolveEmailRelinkPlan(byEmail.plan, subscriptionResult.data);
    const { data, error } = await client
      .from("sva_users")
      .update({ user_id: userId, plan: linkedPlan, updated_at: new Date().toISOString() })
      .ilike("email", normalizedEmail)
      .select("*")
      .single();
    if (error) {
      console.error("[supabase-admin] link auth user:", error.message);
      return null;
    }
    return mapPublicUserRow(data as Row);
  }

  const plan: UserPlan = "free";
  const planConfig = getSvaPlan(plan);
  const now = new Date().toISOString();
  const { data, error } = await client.from("sva_users").insert({
    user_id: userId,
    email: normalizedEmail,
    plan,
    status: "active",
    usage_count: 0,
    daily_usage: 0,
    monthly_usage: 0,
    credits_remaining: planConfig.dailyVerificationLimit,
    credits_reset_at: nextResetAt(plan),
    onboarding_completed: false,
    created_at: now,
    updated_at: now
  }).select("*").single();
  if (error) {
    console.error("[supabase-admin] create auth user:", error.message);
    return null;
  }
  const balanceResult = await client.from("usage_balances").upsert(
    {
      user_id: userId,
      plan: "free",
      daily_limit: planConfig.dailyVerificationLimit,
      daily_used: 0,
      monthly_limit: planConfig.monthlyVerificationLimit,
      monthly_used: 0,
      daily_reset_at: nextResetAt("free"),
      billing_period_start: now,
      billing_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      active_verifications: 0,
      updated_at: now
    },
    { onConflict: "user_id" }
  );
  if (balanceResult.error) {
    console.error("[supabase-admin] initialize free usage balance:", balanceResult.error.message);
    return null;
  }
  return mapPublicUserRow(data as Row);
};

export const updateSupabaseUserPlanByEmail = async (email: string, plan: UserPlan): Promise<PublicUser | null> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  if (!client || !normalizedEmail) {
    return null;
  }

  const { data, error } = await client
    .from("sva_users")
    .update({ plan })
    .ilike("email", normalizedEmail)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[supabase-admin] update plan:", error.message);
    return null;
  }

  return data ? mapPublicUserRow(data as Row) : null;
};

const mapFeedbackRow = (row: Row): AdminFeedbackRecord | null => {
  const id = pickString(row, ["id"]);
  const timestamp = pickString(row, ["created_at", "createdAt", "timestamp"]);
  if (!id || !timestamp) {
    return null;
  }

  const ratingValue = row.rating ?? row.stars;
  const rating =
    typeof ratingValue === "number"
      ? ratingValue
      : typeof ratingValue === "string" && ratingValue.trim() && !Number.isNaN(Number(ratingValue))
        ? Number(ratingValue)
        : null;

  return {
    id,
    email: pickString(row, ["email", "user_email", "userEmail"]) || "Unknown user",
    rating,
    comment: pickString(row, ["comment", "feedback", "message", "body"]),
    timestamp
  };
};

const mapLogRow = (row: Row, emailByUserId: Map<string, string>): AdminVerificationLog | null => {
  const id = pickString(row, ["id"]);
  const timestamp = pickString(row, ["created_at", "createdAt", "timestamp"]);
  const query = pickString(row, ["query", "prompt", "input"]);
  const modeRaw = pickString(row, ["mode"]);
  const mode = modeRaw === "deep" || modeRaw === "research" || modeRaw === "fast" ? modeRaw : "fast";

  if (!id || !timestamp) {
    return null;
  }

  const userId = pickString(row, ["user_id", "userId"]);
  const email =
    pickString(row, ["email", "user_email", "userEmail"]) ||
    (userId ? emailByUserId.get(userId) : "") ||
    "Unknown user";

  const planRaw = pickString(row, ["plan"]) || "free";
  const plan = isUserPlan(planRaw) ? planRaw : "free";

  return {
    id,
    email,
    query: query || "(no query)",
    mode,
    modelsUsed: pickString(row, ["models_used", "modelsUsed"]) || planToModelsLabel(plan),
    trustScore: pickNumber(row, ["trust_score", "trustScore", "confidence", "score"]),
    timestamp,
    status: pickString(row, ["status", "verdict", "result"]) || "completed"
  };
};

export const fetchAdminOverviewFromSupabase = async (): Promise<AdminOverviewStats | null> => {
  const client = getSupabaseAdminClient();
  if (!client) {
    return null;
  }

  const today = todayIsoDate();
  const [usersRes, logsRes, feedbackRes] = await Promise.all([
    client.from("sva_users").select("*"),
    client.from("verification_logs").select("id, created_at"),
    client.from("feedback").select("id, created_at")
  ]);

  if (usersRes.error) {
    console.error("[supabase-admin] sva_users:", usersRes.error.message);
    return null;
  }

  const users = (usersRes.data ?? []) as Row[];
  const logs = (logsRes.error ? [] : ((logsRes.data ?? []) as Row[]));
  const feedback = (feedbackRes.error ? [] : ((feedbackRes.data ?? []) as Row[]));

  if (logsRes.error) {
    console.error("[supabase-admin] verification_logs:", logsRes.error.message);
  }
  if (feedbackRes.error) {
    console.error("[supabase-admin] feedback:", feedbackRes.error.message);
  }

  const freeUsers = users.filter((row) => pickString(row, ["plan"]) === "free").length;
  const proUsers = users.filter((row) => pickString(row, ["plan"]) === "pro").length;
  const ultraUsers = users.filter((row) => pickString(row, ["plan"]) === "ultra").length;

  const verificationsToday = logs.filter((row) => pickString(row, ["created_at", "createdAt"]).startsWith(today)).length;
  const newUsersToday = users.filter((row) => pickString(row, ["created_at", "createdAt"]).startsWith(today)).length;

  const configuredProviders = [
    Boolean(process.env.OPENROUTER_API_KEY),
    Boolean(process.env.OPENAI_API_KEY),
    Boolean(process.env.GEMINI_API_KEY),
    Boolean(process.env.DEEPSEEK_API_KEY),
    Boolean(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY || process.env.WEB_RETRIEVAL_API_KEY),
    isSupabaseAdminConfigured()
  ];
  const configuredCount = configuredProviders.filter(Boolean).length;
  const systemHealth: AdminOverviewStats["systemHealth"] =
    configuredCount >= 4 ? "healthy" : configuredCount >= 2 ? "warning" : "issue";

  return {
    totalUsers: users.length,
    newUsersToday,
    totalVerifications: logs.length,
    verificationsToday,
    freeUsers,
    proUsers,
    ultraUsers,
    feedbackCount: feedback.length,
    systemHealth,
    dataSource: users.length === 0 && logs.length === 0 && feedback.length === 0 ? "empty" : "live"
  };
};

export const fetchAdminUsersFromSupabase = async (): Promise<AdminUserRecord[] | null> => {
  const client = getSupabaseAdminClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.from("sva_users").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("[supabase-admin] list users:", error.message);
    return null;
  }

  return ((data ?? []) as Row[])
    .map(mapUserRow)
    .filter((row): row is AdminUserRecord => row !== null);
};

export const fetchAdminFeedbackFromSupabase = async (): Promise<AdminFeedbackRecord[] | null> => {
  const client = getSupabaseAdminClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[supabase-admin] list feedback:", error.message);
    return null;
  }

  return ((data ?? []) as Row[])
    .map(mapFeedbackRow)
    .filter((row): row is AdminFeedbackRecord => row !== null);
};

export const fetchAdminLogsFromSupabase = async (): Promise<AdminVerificationLog[] | null> => {
  const client = getSupabaseAdminClient();
  if (!client) {
    return null;
  }

  const [usersRes, logsRes] = await Promise.all([
    client.from("sva_users").select("user_id, id, email"),
    client
      .from("verification_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  if (logsRes.error) {
    console.error("[supabase-admin] list logs:", logsRes.error.message);
    return null;
  }

  const emailByUserId = new Map<string, string>();
  for (const row of (usersRes.data ?? []) as Row[]) {
    const userId = pickString(row, ["user_id", "userId", "id"]);
    const email = pickString(row, ["email"]);
    if (userId && email) {
      emailByUserId.set(userId, email);
    }
  }

  return ((logsRes.data ?? []) as Row[])
    .map((row) => mapLogRow(row, emailByUserId))
    .filter((row): row is AdminVerificationLog => row !== null);
};

