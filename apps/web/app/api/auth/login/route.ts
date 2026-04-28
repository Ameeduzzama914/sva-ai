import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "../../../../lib/server/auth";
import { toPublicUser, trackEvent, verifyUserCredentials } from "../../../../lib/server/store";

type Body = { email?: string; password?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json({ ok: false, message: "Email and password are required." }, { status: 400 });
  }

  const user = await verifyUserCredentials(email, password);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Invalid credentials." }, { status: 401 });
  }

  await trackEvent("login", user.userId);
  const response = NextResponse.json({ ok: true, user: toPublicUser(user) });
  response.cookies.set(AUTH_COOKIE, user.userId, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
