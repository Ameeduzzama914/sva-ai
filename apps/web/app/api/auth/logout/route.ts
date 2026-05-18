import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "../../../../lib/server/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, maxAge: 0, sameSite: "lax", path: "/" });
  return response;
}
