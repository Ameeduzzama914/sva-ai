import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "../../../../lib/server/auth";
import { createUser, toPublicUser, trackEvent } from "../../../../lib/server/store";

type Body = { email?: string; password?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password || password.length < 6) {
    return NextResponse.json({ ok: false, message: "Provide valid email and password (min 6 chars)." }, { status: 400 });
  }

  const user = await createUser(email, password);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Email already exists." }, { status: 409 });
  }

  await trackEvent("signup", user.userId);
  const response = NextResponse.json({ ok: true, user: toPublicUser(user) });
  response.cookies.set(AUTH_COOKIE, user.userId, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
