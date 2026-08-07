import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "./supabase-admin";

let authClient: SupabaseClient | null | undefined;

export const getSupabaseAuthClient = (): SupabaseClient | null => {
  if (authClient !== undefined) return authClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    authClient = null;
    return null;
  }
  authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return authClient;
};

export const isSupabaseAuthConfigured = (): boolean => Boolean(getSupabaseAuthClient());

export const signUpWithEmailPassword = async (email: string, password: string): Promise<{ ok: true; user: User | null } | { ok: false; message: string; emailConfirmationRequired?: boolean }> => {
  const client = getSupabaseAuthClient();
  if (!client) return { ok: false, message: "Supabase Auth is not configured." };
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message, emailConfirmationRequired: /confirm|verified|already|registered/i.test(error.message) };
  return { ok: true, user: data.user };
};

export const signInWithEmailPassword = async (email: string, password: string): Promise<{ ok: true; user: User } | { ok: false; message: string; emailConfirmationRequired?: boolean }> => {
  const client = getSupabaseAuthClient();
  if (!client) return { ok: false, message: "Supabase Auth is not configured." };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message, emailConfirmationRequired: /confirm|verified|not confirmed/i.test(error.message) };
  if (!data.user) return { ok: false, message: "Invalid credentials." };
  if (!data.user.email_confirmed_at && !data.user.confirmed_at) return { ok: false, message: "Please verify your email before logging in.", emailConfirmationRequired: true };
  return { ok: true, user: data.user };
};

export const verifySignupEmailOtp = async (email: string, token: string): Promise<{ ok: true; user: User } | { ok: false; message: string }> => {
  const client = getSupabaseAuthClient();
  if (!client) return { ok: false, message: "Supabase Auth is not configured." };
  const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) return { ok: false, message: error?.message ?? "Invalid or expired verification code." };
  return { ok: true, user: data.user };
};

export const resendSignupEmailOtp = async (email: string): Promise<{ ok: true } | { ok: false; message: string }> => {
  const client = getSupabaseAuthClient();
  if (!client) return { ok: false, message: "Supabase Auth is not configured." };
  const { error } = await client.auth.resend({ type: "signup", email });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
};

export const getSupabaseAuthUserById = async (userId: string): Promise<User | null> => {
  const admin = getSupabaseAdminClient();
  if (!admin || !userId) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user ?? null;
};

export const isSupabaseEmailVerified = (user: Pick<User, "email_confirmed_at" | "confirmed_at"> | null): boolean =>
  Boolean(user?.email_confirmed_at || user?.confirmed_at);
