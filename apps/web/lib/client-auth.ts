export type ClientSession = {
  email: string;
  plan: "free" | "pro" | "plus";
  createdAt: string;
};

const SESSION_KEY = "sva_session";
const USERS_KEY = "sva_users";
const PLAN_INTENT_KEY = "sva_plan_intent";
const USAGE_KEY = "sva_usage";

export const getSession = (): ClientSession | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ClientSession; } catch { return null; }
};

export const setSession = (session: ClientSession) => localStorage.setItem(SESSION_KEY, JSON.stringify(session));
export const logout = () => localStorage.removeItem(SESSION_KEY);

export const setPlanIntent = (plan: "free" | "pro" | "plus") => localStorage.setItem(PLAN_INTENT_KEY, plan);
export const getPlanIntent = (): "free" | "pro" | "plus" | null => (localStorage.getItem(PLAN_INTENT_KEY) as "free" | "pro" | "plus" | null);

export const signupUser = (email: string, password: string): { ok: boolean; message?: string } => {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as Array<{ email: string; password: string; plan: "free" | "pro" | "plus" }>;
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return { ok: false, message: "Account already exists." };
  const plan = getPlanIntent() ?? "free";
  users.push({ email, password, plan });
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return { ok: true };
};

export const loginUser = (email: string, password: string): { ok: boolean; plan?: "free" | "pro" | "plus"; message?: string } => {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as Array<{ email: string; password: string; plan: "free" | "pro" | "plus" }>;
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  return user ? { ok: true, plan: user.plan } : { ok: false, message: "Invalid email or password." };
};

export const getUsage = (email: string) => {
  const key = `${USAGE_KEY}_${email.toLowerCase()}_${new Date().toISOString().slice(0, 10)}`;
  const used = Number(localStorage.getItem(key) ?? "0");
  return { used, limit: 10, remaining: Math.max(0, 10 - used), key };
};

export const incrementUsage = (email: string) => {
  const usage = getUsage(email);
  localStorage.setItem(usage.key, String(usage.used + 1));
};
