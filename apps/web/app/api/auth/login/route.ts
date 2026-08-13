import { NextResponse } from "next/server";
import { setAuthCookie } from "../../../../lib/server/auth";
import { ensureSupabaseUser, isSupabaseAdminConfigured } from "../../../../lib/server/supabase-admin";
import { signInWithEmailPassword, isSupabaseAuthConfigured } from "../../../../lib/server/supabase-auth";
import { createUser, getUserByEmail, toPublicUser, trackEvent, verifyUserCredentials } from "../../../../lib/server/store";

type Body = { email?: string; password?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password) return NextResponse.json({ ok: false, message: "Email and password are required." }, { status: 400 });

  if (isSupabaseAuthConfigured()) {
    const supabaseLogin = await signInWithEmailPassword(email, password);
    if (supabaseLogin.ok) {
      const durableUser = isSupabaseAdminConfigured() ? await ensureSupabaseUser(supabaseLogin.user.id, email) : null;
      const existing = durableUser ? null : await getUserByEmail(email);
      const localUser = durableUser ? null : existing ?? (await createUser(email, password, supabaseLogin.user.id));
      const user = durableUser ?? localUser;
      if (!user) return NextResponse.json({ ok: false, message: "Unable to open your SVA account." }, { status: 500 });
      await trackEvent("login", user.userId);
      const response = NextResponse.json({ ok: true, user: durableUser ?? toPublicUser(localUser!) });
      setAuthCookie(response, supabaseLogin.user.id);
      return response;
    }

    if (supabaseLogin.emailConfirmationRequired) {
      return NextResponse.json({ ok: false, verificationRequired: true, email, message: "Please verify your email before logging in." }, { status: 403 });
    }
  }

  const user = await verifyUserCredentials(email, password);
  if (!user) return NextResponse.json({ ok: false, message: "Invalid credentials." }, { status: 401 });

  await trackEvent("login", user.userId);
  const response = NextResponse.json({ ok: true, user: toPublicUser(user) });
  setAuthCookie(response, user.userId);
  return response;
}
