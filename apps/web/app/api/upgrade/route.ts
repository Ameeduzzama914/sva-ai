import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { type VerifyApiError } from "../../../lib/models";
import { getUserByEmail, toPublicUser, trackEvent, upgradeUserPlan } from "../../../lib/server/store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    plan?: "pro" | "plus";
  };
  const authenticatedUser = await getAuthenticatedUser();
  const authenticatedEmail = authenticatedUser?.email?.trim().toLowerCase();
  const storeUser = authenticatedEmail ? await getUserByEmail(authenticatedEmail) : null;
  const userId = storeUser?.userId;

  if (!userId) {
    return NextResponse.json({ ok: false, message: "Unauthorized" } as VerifyApiError, { status: 401 });
  }

  const plan = body.plan === "plus" ? "plus" : "pro";
  const upgraded = await upgradeUserPlan(userId, plan);
  if (!upgraded) return NextResponse.json({ ok: false, message: "Upgrade failed" } as VerifyApiError, { status: 400 });
  await trackEvent("upgraded_to_pro", userId, { plan, mode: "test_dev" });
  return NextResponse.json({ ok: true, user: toPublicUser(upgraded) });
}
