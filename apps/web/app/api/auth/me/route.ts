import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/server/auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ ok: false, user: null, message: "Please login first." }, { status: 401 });
  return NextResponse.json({ ok: true, user });
}
