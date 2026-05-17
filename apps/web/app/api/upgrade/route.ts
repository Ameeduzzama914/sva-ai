import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { type VerifyApiError } from "../../../lib/models";
import { upgradeUserPlan, toPublicUser, trackEvent } from "../../../lib/server/store";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" } as VerifyApiError, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { plan?: "pro" | "plus" };
  const plan = body.plan === "plus" ? "plus" : "pro";
  const upgraded = await upgradeUserPlan(user.userId, plan);
  if (!upgraded) return NextResponse.json({ ok: false, message: "Upgrade failed" } as VerifyApiError, { status: 400 });
  await trackEvent("upgraded_to_pro", user.userId, { plan });
  return NextResponse.json({ ok: true, user: toPublicUser(upgraded) });
}
