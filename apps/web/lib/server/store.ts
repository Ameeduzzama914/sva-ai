import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type UserPlan = "free" | "pro" | "ultra";

export type UserHistoryItem = {
  prompt: string;
  mode: "fast" | "deep" | "research";
  resultSummary: string;
  timestamp: string;
  confidence: number;
  verdict: string;
  creditsUsed?: number;
  success?: boolean;
};

type UsageByDate = Record<string, number>;

type StoredUser = {
  userId: string;
  email: string;
  passwordHash: string;
  plan: UserPlan;
  usageCount: number;
  usageByDate: UsageByDate;
  createdAt: string;
  history: UserHistoryItem[];
  onboardingCompleted?: boolean;
  creditsRemaining?: number;
  creditsResetAt?: string;
  monthlyUsage?: number;
  dailyUsage?: number;
};

type AnalyticsEventName =
  | "signup"
  | "login"
  | "verification_started"
  | "verification_completed"
  | "mode_selected"
  | "upgrade_clicked"
  | "upgraded_to_pro"
  | "feedback_submitted";

type AnalyticsEvent = {
  id: string;
  userId?: string;
  event: AnalyticsEventName;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type AppStore = {
  users: StoredUser[];
  analytics: AnalyticsEvent[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const defaultStore: AppStore = { users: [], analytics: [] };
let writeQueue: Promise<void> = Promise.resolve();

const hashPassword = (password: string): string => {
  const salt = randomUUID();
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPasswordHash = (password: string, storedHash: string): boolean => {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }
  const derived = scryptSync(password, salt, 64);
  const hashBuffer = Buffer.from(hash, "hex");
  return derived.length === hashBuffer.length && timingSafeEqual(derived, hashBuffer);
};

const ensureStore = async (): Promise<void> => {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    await writeFile(STORE_PATH, JSON.stringify(defaultStore, null, 2), "utf8");
  }
};

const readStore = async (): Promise<AppStore> => {
  await ensureStore();
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppStore>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      analytics: Array.isArray(parsed.analytics) ? parsed.analytics : []
    };
  } catch {
    await saveStore(defaultStore);
    return { ...defaultStore };
  }
};

const saveStore = async (store: AppStore): Promise<void> => {
  await ensureStore();
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
};

const withWriteLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const current = writeQueue;
  let release: () => void = () => undefined;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await current;
  try {
    return await operation();
  } finally {
    release();
  }
};

export const createUser = async (email: string, password: string): Promise<StoredUser | null> => {
  return withWriteLock(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const store = await readStore();
    if (store.users.some((user) => user.email === normalizedEmail)) {
      return null;
    }

    const user: StoredUser = {
      userId: randomUUID(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      plan: "free",
      usageCount: 0,
      usageByDate: {},
      createdAt: new Date().toISOString(),
      history: [],
      onboardingCompleted: false
      ,
      creditsRemaining: 15,
      creditsResetAt: nextResetAt("free"),
      monthlyUsage: 0,
      dailyUsage: 0
    };

    store.users.push(user);
    await saveStore(store);
    return user;
  });
};

export const getUserByEmail = async (email: string): Promise<StoredUser | null> => {
  const normalizedEmail = email.trim().toLowerCase();
  const store = await readStore();
  return store.users.find((user) => user.email === normalizedEmail) ?? null;
};

export const getUserById = async (userId: string): Promise<StoredUser | null> => {
  const store = await readStore();
  return store.users.find((user) => user.userId === userId) ?? null;
};

export const verifyUserCredentials = async (email: string, password: string): Promise<StoredUser | null> => {
  const user = await getUserByEmail(email);
  if (!user) {
    return null;
  }
  return verifyPasswordHash(password, user.passwordHash) ? user : null;
};

export const upgradeUserToPro = async (userId: string): Promise<StoredUser | null> => {
  return withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) {
      return null;
    }
    user.plan = "pro";
    user.creditsRemaining = PLAN_CREDIT_LIMIT.pro;
    user.creditsResetAt = nextResetAt("pro");
    await saveStore(store);
    return user;
  });
};

export const upgradeUserPlan = async (userId: string, plan: UserPlan): Promise<StoredUser | null> =>
  withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) return null;
    user.plan = plan;
    user.creditsRemaining = PLAN_CREDIT_LIMIT[plan];
    user.creditsResetAt = nextResetAt(plan);
    user.dailyUsage = 0;
    user.monthlyUsage = 0;
    await saveStore(store);
    return user;
  });

export const appendHistoryForUser = async (userId: string, item: UserHistoryItem): Promise<StoredUser | null> => {
  return withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) {
      return null;
    }
    user.history = [item, ...user.history].slice(0, 20);
    await saveStore(store);
    return user;
  });
};

export const markOnboardingCompleted = async (userId: string): Promise<void> => {
  await withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) {
      return;
    }
    user.onboardingCompleted = true;
    await saveStore(store);
  });
};

export const getUsageForToday = (user: StoredUser): number => {
  const dayKey = new Date().toISOString().slice(0, 10);
  return user.usageByDate[dayKey] ?? 0;
};

export const incrementUsageForToday = async (userId: string): Promise<{ usedToday: number; totalUsage: number } | null> => {
  return withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) {
      return null;
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    const next = (user.usageByDate[dayKey] ?? 0) + 1;
    user.usageByDate[dayKey] = next;
    user.usageCount += 1;
    await saveStore(store);
    return { usedToday: next, totalUsage: user.usageCount };
  });
};

export const consumeDailyVerificationQuota = async (
  userId: string
): Promise<{ ok: true; usedToday: number; dailyLimit: number; plan: UserPlan } | { ok: false; dailyLimit: number; usedToday: number; plan: UserPlan } | null> => {
  return withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) {
      return null;
    }

    const dayKey = new Date().toISOString().slice(0, 10);
    const usedToday = user.usageByDate[dayKey] ?? 0;
    const dailyLimit = getDailyLimit(user.plan);
    if (usedToday >= dailyLimit) {
      return { ok: false, dailyLimit, usedToday, plan: user.plan };
    }

    const next = usedToday + 1;
    user.usageByDate[dayKey] = next;
    user.usageCount += 1;
    await saveStore(store);
    return { ok: true, usedToday: next, dailyLimit, plan: user.plan };
  });
};

export const getDailyLimit = (plan: UserPlan): number => {
  return PLAN_CREDIT_LIMIT[plan];
};

export const trackEvent = async (
  event: AnalyticsEventName,
  userId?: string,
  metadata?: Record<string, string | number | boolean | null>
): Promise<void> => {
  await withWriteLock(async () => {
    const store = await readStore();
    store.analytics = [
      {
        id: randomUUID(),
        userId,
        event,
        timestamp: new Date().toISOString(),
        metadata
      },
      ...store.analytics
    ].slice(0, 2000);
    await saveStore(store);
  });
};

export const getAnalyticsCount = async (): Promise<number> => {
  const store = await readStore();
  return store.analytics.length;
};

export type PublicUser = {
  userId: string;
  email: string;
  plan: UserPlan;
  usageCount: number;
  createdAt: string;
  usedToday: number;
  dailyLimit: number;
  onboardingCompleted: boolean;
  creditsRemaining: number;
  creditsResetAt: string;
  monthlyUsage: number;
  dailyUsage: number;
};

export const consumeVerificationCredits = async (
  userId: string,
  mode: "fast" | "deep" | "research"
): Promise<{ ok: true; creditsRemaining: number; creditsUsed: number; plan: UserPlan; creditsResetAt: string } | { ok: false; creditsRemaining: number; creditsUsed: number; plan: UserPlan; creditsResetAt: string } | null> =>
  withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) return null;
    resetCreditsIfNeededInternal(user);
    const cost = getVerificationCreditCost(mode);
    const remaining = user.creditsRemaining ?? PLAN_CREDIT_LIMIT[user.plan];
    if (remaining < cost) {
      return { ok: false, creditsRemaining: remaining, creditsUsed: cost, plan: user.plan, creditsResetAt: user.creditsResetAt ?? nextResetAt(user.plan) };
    }
    user.creditsRemaining = remaining - cost;
    user.dailyUsage = (user.dailyUsage ?? 0) + cost;
    user.monthlyUsage = (user.monthlyUsage ?? 0) + cost;
    await saveStore(store);
    return { ok: true, creditsRemaining: user.creditsRemaining, creditsUsed: cost, plan: user.plan, creditsResetAt: user.creditsResetAt ?? nextResetAt(user.plan) };
  });

export const toPublicUser = (user: StoredUser): PublicUser => ({
  userId: user.userId,
  email: user.email,
  plan: user.plan,
  usageCount: user.usageCount,
  createdAt: user.createdAt,
  usedToday: getUsageForToday(user),
  dailyLimit: getDailyLimit(user.plan),
  onboardingCompleted: Boolean(user.onboardingCompleted),
  creditsRemaining: user.creditsRemaining ?? PLAN_CREDIT_LIMIT[user.plan],
  creditsResetAt: user.creditsResetAt ?? nextResetAt(user.plan),
  monthlyUsage: user.monthlyUsage ?? 0,
  dailyUsage: user.dailyUsage ?? 0
});

export const getUserHistory = async (userId: string): Promise<UserHistoryItem[]> => {
  const user = await getUserById(userId);
  return user?.history ?? [];
};

export const clearUserHistory = async (userId: string): Promise<void> => {
  await withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) {
      return;
    }
    user.history = [];
    await saveStore(store);
  });
};
const PLAN_CREDIT_LIMIT: Record<UserPlan, number> = { free: 15, pro: 50, ultra: 150 };
export const getMonthlyCreditLimit = (plan: UserPlan): number => (plan === "free" ? 0 : PLAN_CREDIT_LIMIT[plan]);
export const getPlanCreditLimit = (plan: UserPlan): number => PLAN_CREDIT_LIMIT[plan];
export const getVerificationCreditCost = (mode: "fast" | "deep" | "research"): number => (mode === "research" ? 5 : mode === "deep" ? 3 : 1);

const nextResetAt = (plan: UserPlan): string => {
  const now = new Date();
  if (plan === "free") {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.toISOString();
  }
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return next.toISOString();
};

const resetCreditsIfNeededInternal = (user: StoredUser): void => {
  const resetAt = user.creditsResetAt ? new Date(user.creditsResetAt).getTime() : 0;
  if (!resetAt || Date.now() >= resetAt) {
    user.creditsRemaining = PLAN_CREDIT_LIMIT[user.plan];
    user.creditsResetAt = nextResetAt(user.plan);
    user.dailyUsage = 0;
    if (user.plan !== "free") user.monthlyUsage = 0;
  }
};
export const resetCreditsIfNeeded = async (userId: string): Promise<void> => {
  await withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) return;
    resetCreditsIfNeededInternal(user);
    await saveStore(store);
  });
};

export const resetUserUsage = async (userId: string): Promise<StoredUser | null> =>
  withWriteLock(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.userId === userId);
    if (!user) {
      return null;
    }
    user.usageCount = 0;
    user.usageByDate = {};
    user.dailyUsage = 0;
    user.monthlyUsage = 0;
    user.creditsRemaining = PLAN_CREDIT_LIMIT[user.plan];
    user.creditsResetAt = nextResetAt(user.plan);
    await saveStore(store);
    return user;
  });

export type AdminUserRecord = {
  userId: string;
  email: string;
  plan: UserPlan;
  dailyUsage: number;
  totalVerifications: number;
  joinedDate: string;
  status: "active" | "idle";
};

export type AdminFeedbackRecord = {
  id: string;
  email: string;
  rating: number | null;
  comment: string;
  timestamp: string;
};

export type AdminVerificationLog = {
  id: string;
  email: string;
  query: string;
  mode: UserHistoryItem["mode"];
  modelsUsed: string;
  trustScore: number;
  timestamp: string;
  status: string;
};

export type AdminOverviewStats = {
  totalUsers: number;
  newUsersToday: number;
  totalVerifications: number;
  verificationsToday: number;
  freeUsers: number;
  proUsers: number;
  ultraUsers: number;
  feedbackCount: number;
  systemHealth: "healthy" | "warning" | "issue";
  dataSource: "live" | "empty";
};

const planToModelsLabel = (plan: UserPlan): string => {
  if (plan === "pro" || plan === "ultra") {
    return "GPT, Gemini, DeepSeek";
  }
  return "Mistral, Llama, Gemma";
};

export const getAdminOverviewStats = async (): Promise<AdminOverviewStats> => {
  const { fetchAdminOverviewFromSupabase, isSupabaseAdminConfigured } = await import("./supabase-admin");
  if (isSupabaseAdminConfigured()) {
    const fromSupabase = await fetchAdminOverviewFromSupabase();
    if (fromSupabase) {
      return fromSupabase;
    }
  }

  const store = await readStore();
  const today = new Date().toISOString().slice(0, 10);

  if (store.users.length === 0 && store.analytics.length === 0) {
    return {
      totalUsers: 0,
      newUsersToday: 0,
      totalVerifications: 0,
      verificationsToday: 0,
      freeUsers: 0,
      proUsers: 0,
      ultraUsers: 0,
      feedbackCount: 0,
      systemHealth: "warning",
      dataSource: "empty"
    };
  }

  const totalVerifications = store.users.reduce((sum, user) => sum + user.usageCount, 0);
  const verificationsToday = store.users.reduce((sum, user) => sum + (user.usageByDate[today] ?? 0), 0);
  const verificationEventsToday = store.analytics.filter(
    (event) => event.event === "verification_completed" && event.timestamp.startsWith(today)
  ).length;

  const configuredProviders = [
    Boolean(process.env.OPENROUTER_API_KEY),
    Boolean(process.env.OPENAI_API_KEY),
    Boolean(process.env.GEMINI_API_KEY),
    Boolean(process.env.DEEPSEEK_API_KEY),
    Boolean(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY || process.env.WEB_RETRIEVAL_API_KEY)
  ];
  const configuredCount = configuredProviders.filter(Boolean).length;
  const systemHealth: AdminOverviewStats["systemHealth"] =
    configuredCount >= 4 ? "healthy" : configuredCount >= 2 ? "warning" : "issue";

  return {
    totalUsers: store.users.length,
    newUsersToday: store.users.filter((user) => user.createdAt.startsWith(today)).length,
    totalVerifications,
    verificationsToday: Math.max(verificationsToday, verificationEventsToday),
    freeUsers: store.users.filter((user) => user.plan === "free").length,
    proUsers: store.users.filter((user) => user.plan === "pro").length,
    ultraUsers: store.users.filter((user) => user.plan === "ultra").length,
    feedbackCount: store.analytics.filter((event) => event.event === "feedback_submitted").length,
    systemHealth,
    dataSource: "live"
  };
};

export const listAdminUsers = async (): Promise<AdminUserRecord[]> => {
  const { fetchAdminUsersFromSupabase, isSupabaseAdminConfigured } = await import("./supabase-admin");
  if (isSupabaseAdminConfigured()) {
    const fromSupabase = await fetchAdminUsersFromSupabase();
    if (fromSupabase) {
      return fromSupabase;
    }
  }

  const store = await readStore();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return store.users
    .map((user) => {
      const lastActivity = user.history[0]?.timestamp ?? user.createdAt;
      return {
        userId: user.userId,
        email: user.email,
        plan: user.plan,
        dailyUsage: getUsageForToday(user),
        totalVerifications: user.usageCount,
        joinedDate: user.createdAt,
        status: new Date(lastActivity).getTime() >= weekAgo ? "active" : "idle"
      } satisfies AdminUserRecord;
    })
    .sort((a, b) => b.joinedDate.localeCompare(a.joinedDate));
};

export const listAdminFeedback = async (): Promise<AdminFeedbackRecord[]> => {
  const { fetchAdminFeedbackFromSupabase, isSupabaseAdminConfigured } = await import("./supabase-admin");
  if (isSupabaseAdminConfigured()) {
    const fromSupabase = await fetchAdminFeedbackFromSupabase();
    if (fromSupabase) {
      return fromSupabase;
    }
  }

  const store = await readStore();
  const userEmailById = new Map(store.users.map((user) => [user.userId, user.email]));

  return store.analytics
    .filter((event) => event.event === "feedback_submitted")
    .map((event) => ({
      id: event.id,
      email: event.userId ? (userEmailById.get(event.userId) ?? "Unknown user") : "Anonymous",
      rating: typeof event.metadata?.rating === "number" ? event.metadata.rating : null,
      comment: String(event.metadata?.feedback ?? event.metadata?.comment ?? "").trim(),
      timestamp: event.timestamp
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

export const listAdminVerificationLogs = async (): Promise<AdminVerificationLog[]> => {
  const { fetchAdminLogsFromSupabase, isSupabaseAdminConfigured } = await import("./supabase-admin");
  if (isSupabaseAdminConfigured()) {
    const fromSupabase = await fetchAdminLogsFromSupabase();
    if (fromSupabase) {
      return fromSupabase;
    }
  }

  const store = await readStore();

  return store.users
    .flatMap((user) =>
      user.history.map((item, index) => ({
        id: `${user.userId}-${item.timestamp}-${index}`,
        email: user.email,
        query: item.prompt,
        mode: item.mode,
        modelsUsed: planToModelsLabel(user.plan),
        trustScore: item.confidence,
        timestamp: item.timestamp,
        status: item.success === false ? "failed" : item.verdict
      }))
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 100);
};
