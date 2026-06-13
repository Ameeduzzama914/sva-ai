import { cookies } from "next/headers";
import { getUserByEmail, getUserById, toPublicUser, type PublicUser } from "./store";
import { getEffectivePlanForEmail } from "../founder-access";

export const AUTH_COOKIE = "sva_user_id";
export const SESSION_EMAIL_HEADER = "x-sva-session-email";

const normalizeEmail = (email: string | null | undefined): string => email?.trim().toLowerCase() ?? "";

const withFounderAccess = (user: PublicUser): PublicUser => {
  const plan = getEffectivePlanForEmail(user.email, user.plan) as PublicUser["plan"];
  if (plan === user.plan) return user;

  return {
    ...user,
    plan,
    dailyLimit: 150,
    creditsRemaining: Math.max(user.creditsRemaining, 150)
  };
};

export const getAuthenticatedUser = async (request?: Request): Promise<PublicUser | null> => {
  const sessionEmail = normalizeEmail(request?.headers.get(SESSION_EMAIL_HEADER));
  if (sessionEmail) {
    const { fetchPublicUserByEmailFromSupabase, isSupabaseAdminConfigured } = await import("./supabase-admin");
    if (isSupabaseAdminConfigured()) {
      const supabaseUser = await fetchPublicUserByEmailFromSupabase(sessionEmail);
      if (supabaseUser) {
        return withFounderAccess(supabaseUser);
      }
    }

    const localUser = await getUserByEmail(sessionEmail);
    if (localUser) {
      return withFounderAccess(toPublicUser(localUser));
    }
  }

  const cookieStore = await cookies();
  const userId = cookieStore.get(AUTH_COOKIE)?.value;
  if (!userId) {
    return null;
  }
  const user = await getUserById(userId);
  return user ? withFounderAccess(toPublicUser(user)) : null;
};
