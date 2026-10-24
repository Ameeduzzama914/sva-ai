import { NextResponse } from "next/server";
import { setAuthCookie } from "../../../../../lib/server/auth";
import { ensureSupabaseUserWithStatus } from "../../../../../lib/server/supabase-admin";
import { getSupabaseAuthClient, isSupabaseEmailVerified } from "../../../../../lib/server/supabase-auth";
import { trackEvent } from "../../../../../lib/server/store";

type Body = { accessToken?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const accessToken = body.accessToken?.trim();
  if (!accessToken) return NextResponse.json({ ok: false, message: "OAuth session is required." }, { status: 400 });

  const supabase = getSupabaseAuthClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Authentication is temporarily unavailable." }, { status: 503 });

  const { data, error } = await supabase.auth.getUser(accessToken);
  const authUser = data.user;
  if (error || !authUser?.email || !isSupabaseEmailVerified(authUser)) {
    return NextResponse.json({ ok: false, message: "Google authentication could not be verified." }, { status: 401 });
  }

  const ensured = await ensureSupabaseUserWithStatus(authUser.id, authUser.email);
  if (!ensured) return NextResponse.json({ ok: false, message: "Unable to open your SVA account." }, { status: 500 });
  const { user } = ensured;

  await trackEvent("login", user.userId);
  const response = NextResponse.json({ ok: true, user, registrationCompleted: ensured.created });
  setAuthCookie(response, authUser.id);
  return response;
}
