import { NextResponse } from "next/server";
import { resendSignupEmailOtp } from "../../../../lib/server/supabase-auth";

type Body = { email?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: false, message: "Email is required." }, { status: 400 });

  const result = await resendSignupEmailOtp(email);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: "Please wait before requesting another code." }, { status: 429 });
  }

  return NextResponse.json({ ok: true, message: "If that email is waiting for verification, a new code has been sent." });
}
