import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminFeedbackRecord,
  AdminOverviewStats,
  AdminUserRecord,
  AdminVerificationLog,
  UserPlan
} from "./store";

type Row = Record<string, unknown>;

const isUserPlan = (value: unknown): value is UserPlan =>
  value === "free" || value === "pro" || value === "plus";

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
  if (plan === "pro" || plan === "plus") {
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
  const ultraUsers = users.filter((row) => pickString(row, ["plan"]) === "plus").length;

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
