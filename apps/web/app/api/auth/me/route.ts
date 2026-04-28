import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/server/auth";

export async function GET() {
  const user = await getAuthenticatedUser();
  return NextResponse.json({ ok: true, user });
}
