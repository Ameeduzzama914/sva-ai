import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { ensureSupabaseUser, fetchPublicUserByIdFromSupabase, isSupabaseAdminConfigured } from "./supabase-admin";
import { getSupabaseAuthUserById, isSupabaseEmailVerified } from "./supabase-auth";
import { getUserById, toPublicUser, type PublicUser } from "./store";

export const AUTH_COOKIE = "sva_user_id";
export const SESSION_EMAIL_HEADER = "x-sva-session-email";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const sessionSecret = () => process.env.SVA_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const signatureFor = (userId: string) => createHmac("sha256", sessionSecret()).update(userId).digest("base64url");

export const createSessionCookieValue = (userId: string): string => {
  if (!sessionSecret()) throw new Error("SVA session secret is not configured.");
  return `${userId}.${signatureFor(userId)}`;
};

const readSessionUserId = (value?: string): string | null => {
  if (!value || !sessionSecret()) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const userId = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signatureFor(userId));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? userId : null;
};

export const setAuthCookie = (response: NextResponse, userId: string): void => {
  response.cookies.set(AUTH_COOKIE, createSessionCookieValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE
  });
};

export const clearAuthCookie = (response: NextResponse): void => {
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
};

export const getAuthenticatedUser = async (_request?: Request): Promise<PublicUser | null> => {
  const cookieStore = await cookies();
  const userId = readSessionUserId(cookieStore.get(AUTH_COOKIE)?.value);
  if (!userId) return null;

  const supabaseAuthUser = await getSupabaseAuthUserById(userId);
  if (!supabaseAuthUser || !isSupabaseEmailVerified(supabaseAuthUser) || !supabaseAuthUser.email) return null;

  if (isSupabaseAdminConfigured()) {
    const user = (await fetchPublicUserByIdFromSupabase(userId)) ?? (await ensureSupabaseUser(userId, supabaseAuthUser.email));
    return user ? { ...user, emailVerified: true } : null;
  }

  const user = await getUserById(userId);
  if (!user) return null;
  return { ...toPublicUser(user), emailVerified: true };
};
