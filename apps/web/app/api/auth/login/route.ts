import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "../../../../lib/server/auth";
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
      const existing = await getUserByEmail(email);
      const user = existing ?? (await createUser(email, password, supabaseLogin.user.id));
      if (!user) return NextResponse.json({ ok: false, message: "Unable to open your SVA account." }, { status: 500 });
      await trackEvent("login", user.userId);
      const response = NextResponse.json({ ok: true, user: toPublicUser(user) });
      response.cookies.set(AUTH_COOKIE, user.userId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
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
  response.cookies.set(AUTH_COOKIE, user.userId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return response;
}
