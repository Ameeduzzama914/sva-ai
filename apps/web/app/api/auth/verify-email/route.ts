import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { setAuthCookie } from "../../../../lib/server/auth";
import { ensureSupabaseUser, isSupabaseAdminConfigured } from "../../../../lib/server/supabase-admin";
import { verifySignupEmailOtp } from "../../../../lib/server/supabase-auth";
import { createUser, getUserByEmail, toPublicUser, trackEvent } from "../../../../lib/server/store";

type Body = { email?: string; otp?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase();
  const otp = body.otp?.replace(/\D/g, "");
  if (!email || !otp || otp.length !== 6) {
    return NextResponse.json({ ok: false, message: "Enter the 6-digit verification code." }, { status: 400 });
  }

  const verified = await verifySignupEmailOtp(email, otp);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, message: "That code is invalid or expired. Request a new code and try again." }, { status: 400 });
  }

  const durableUser = isSupabaseAdminConfigured() ? await ensureSupabaseUser(verified.user.id, email) : null;
  const existing = durableUser ? null : await getUserByEmail(email);
  const localUser = durableUser ? null : existing ?? (await createUser(email, randomUUID(), verified.user.id));
  const user = durableUser ?? localUser;
  if (!user) return NextResponse.json({ ok: false, message: "Unable to open your SVA account." }, { status: 500 });

  await trackEvent("login", user.userId);
  const response = NextResponse.json({ ok: true, user: durableUser ?? toPublicUser(localUser!), message: "Email verified." });
  setAuthCookie(response, verified.user.id);
  return response;
}

