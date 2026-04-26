import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type UserPlan = "free" | "pro";

export type UserHistoryItem = {
  prompt: string;
  mode: "fast" | "deep" | "research";
  resultSummary: string;
  timestamp: string;
  confidence: number;
  verdict: string;
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
  const raw = await readFile(STORE_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<AppStore>;
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    analytics: Array.isArray(parsed.analytics) ? parsed.analytics : []
  };
};

const saveStore = async (store: AppStore): Promise<void> => {
  await ensureStore();
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
};

export const createUser = async (email: string, password: string): Promise<StoredUser | null> => {
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
  };

  store.users.push(user);
  await saveStore(store);
  return user;
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
  const store = await readStore();
  const user = store.users.find((entry) => entry.userId === userId);
  if (!user) {
    return null;
  }
  user.plan = "pro";
  await saveStore(store);
  return user;
};

export const appendHistoryForUser = async (userId: string, item: UserHistoryItem): Promise<StoredUser | null> => {
  const store = await readStore();
  const user = store.users.find((entry) => entry.userId === userId);
  if (!user) {
    return null;
  }
  user.history = [item, ...user.history].slice(0, 20);
  await saveStore(store);
  return user;
};

export const markOnboardingCompleted = async (userId: string): Promise<void> => {
  const store = await readStore();
  const user = store.users.find((entry) => entry.userId === userId);
  if (!user) {
    return;
  }
  user.onboardingCompleted = true;
  await saveStore(store);
};

export const getUsageForToday = (user: StoredUser): number => {
  const dayKey = new Date().toISOString().slice(0, 10);
  return user.usageByDate[dayKey] ?? 0;
};

export const incrementUsageForToday = async (userId: string): Promise<{ usedToday: number; totalUsage: number } | null> => {
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
};

export const getDailyLimit = (plan: UserPlan): number => {
  return plan === "pro" ? 100 : 10;
};

export const trackEvent = async (
  event: AnalyticsEventName,
  userId?: string,
  metadata?: Record<string, string | number | boolean | null>
): Promise<void> => {
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
};

export const toPublicUser = (user: StoredUser): PublicUser => ({
  userId: user.userId,
  email: user.email,
  plan: user.plan,
  usageCount: user.usageCount,
  createdAt: user.createdAt,
  usedToday: getUsageForToday(user),
  dailyLimit: getDailyLimit(user.plan),
  onboardingCompleted: Boolean(user.onboardingCompleted)
});

export const getUserHistory = async (userId: string): Promise<UserHistoryItem[]> => {
  const user = await getUserById(userId);
  return user?.history ?? [];
};

export const clearUserHistory = async (userId: string): Promise<void> => {
  const store = await readStore();
  const user = store.users.find((entry) => entry.userId === userId);
  if (!user) {
    return;
  }
  user.history = [];
  await saveStore(store);
};
