import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/server/auth";
import { markOnboardingCompleted } from "../../../../lib/server/store";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  await markOnboardingCompleted(user.userId);
  return NextResponse.json({ ok: true });
}
