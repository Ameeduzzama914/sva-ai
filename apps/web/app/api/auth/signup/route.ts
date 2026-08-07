import { NextResponse } from "next/server";
import { signUpWithEmailPassword } from "../../../../lib/server/supabase-auth";
import { createUser, getUserByEmail, trackEvent } from "../../../../lib/server/store";

type Body = { email?: string; password?: string };

const genericVerificationMessage = "Check your email for the 6-digit SVA verification code.";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password || password.length < 6) {
    return NextResponse.json({ ok: false, message: "Provide valid email and password (min 6 chars)." }, { status: 400 });
  }

  const signup = await signUpWithEmailPassword(email, password);
  if (!signup.ok) {
    if (signup.emailConfirmationRequired) {
      return NextResponse.json({ ok: true, verificationRequired: true, email, message: genericVerificationMessage });
    }
    return NextResponse.json({ ok: false, message: "Unable to create account right now." }, { status: 503 });
  }

  const existing = await getUserByEmail(email);
  const user = existing ?? (await createUser(email, password, signup.user?.id));
  if (user) await trackEvent("signup", user.userId);

  return NextResponse.json({ ok: true, verificationRequired: true, email, message: genericVerificationMessage });
}
