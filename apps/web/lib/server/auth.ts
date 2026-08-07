import { cookies } from "next/headers";
import { getSupabaseAuthUserById, isSupabaseEmailVerified } from "./supabase-auth";
import { getUserById, toPublicUser, type PublicUser } from "./store";

export const AUTH_COOKIE = "sva_user_id";
export const SESSION_EMAIL_HEADER = "x-sva-session-email";

export const getAuthenticatedUser = async (_request?: Request): Promise<PublicUser | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(AUTH_COOKIE)?.value;
  if (!userId) return null;

  const user = await getUserById(userId);
  if (!user) return null;

  const supabaseAuthUser = await getSupabaseAuthUserById(userId);
  if (supabaseAuthUser && !isSupabaseEmailVerified(supabaseAuthUser)) return null;

  const publicUser = toPublicUser(user);
  return { ...publicUser, emailVerified: supabaseAuthUser ? true : publicUser.emailVerified ?? true };
};
