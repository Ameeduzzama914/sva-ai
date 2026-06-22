export type UserPlan = "free" | "pro" | "ultra";

export type ClientSession = {
  email: string;
  plan: UserPlan;
  createdAt: string;
  planVerified?: boolean;
};

const SESSION_KEY = "sva_session";
const USERS_KEY = "sva_users";
const PLAN_INTENT_KEY = "sva_plan_intent";
const USAGE_KEY = "sva_usage";

const FOUNDER_EMAIL = "mohammed.ameeduzzama@gmail.com";

const isFounderEmail = (email?: string | null) =>
  email?.toLowerCase() === FOUNDER_EMAIL;

const isUserPlan = (value: unknown): value is UserPlan => value === "free" || value === "pro" || value === "ultra";

export const getSession = (): ClientSession | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ClientSession>;
    if (!parsed.email) return null;
    const parsedPlan = isUserPlan(parsed.plan) ? parsed.plan : "free";
    const plan = isFounderEmail(parsed.email)
  ? "ultra"
  : parsedPlan === "free" || parsed.planVerified
    ? parsedPlan
    : "free";
    return {
      email: parsed.email,
      plan,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      planVerified: Boolean(parsed.planVerified)
    };
  } catch {
    return null;
  }
};

export const setSession = (session: ClientSession) => localStorage.setItem(SESSION_KEY, JSON.stringify(session));
export const logout = () => localStorage.removeItem(SESSION_KEY);
export const getSessionHeaders = (): Record<string, string> => {
  const session = getSession();
  return session?.email ? { "x-sva-session-email": session.email } : {};
};

export const setPlanIntent = (plan: UserPlan) => localStorage.setItem(PLAN_INTENT_KEY, plan);
export const getPlanIntent = (): UserPlan | null => {
  const value = localStorage.getItem(PLAN_INTENT_KEY);
  return isUserPlan(value) ? value : null;
};
export const clearPlanIntent = () => localStorage.removeItem(PLAN_INTENT_KEY);

export const signupUser = (email: string, password: string): { ok: boolean; message?: string } => {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as Array<{ email: string; password: string; plan: UserPlan }>;
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return { ok: false, message: "Account already exists." };
  users.push({ email, password, plan: getSession()?.plan ?? "free" });
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return { ok: true };
};

export const loginUser = (email: string, password: string): { ok: boolean; plan?: UserPlan; message?: string } => {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as Array<{ email: string; password: string; plan: UserPlan }>;
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
 return user
  ? {
      ok: true,
      plan: isFounderEmail(email) ? "ultra" : user.plan
    }
  : {
      ok: false,
      message: "Invalid email or password."
    };
};

const getPlanLimit = (plan: ClientSession["plan"]): number => (plan === "free" ? 10 : plan === "pro" ? 50 : 150);

export const getUsage = (email: string, plan: ClientSession["plan"] = "free") => {
  const key = `${USAGE_KEY}_${email.toLowerCase()}_${new Date().toISOString().slice(0, 10)}`;
  const used = Number(localStorage.getItem(key) ?? "0");
  const limit = getPlanLimit(plan);
  return { used, limit, remaining: Math.max(0, limit - used), key };
};

export const incrementUsage = (email: string, plan: ClientSession["plan"] = "free") => {
  const usage = getUsage(email, plan);
  localStorage.setItem(usage.key, String(usage.used + 1));
};
