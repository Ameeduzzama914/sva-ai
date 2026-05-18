import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/server/auth";
import { trackEvent, upgradeUserToPro, toPublicUser } from "../../../../lib/server/store";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  await trackEvent("upgrade_clicked", user.userId);
  const upgraded = await upgradeUserToPro(user.userId);
  if (!upgraded) {
    return NextResponse.json({ ok: false, message: "Unable to upgrade account." }, { status: 500 });
  }

  await trackEvent("upgraded_to_pro", user.userId, { plan: "pro", amountInr: 499 });
  return NextResponse.json({ ok: true, user: toPublicUser(upgraded) });
}
