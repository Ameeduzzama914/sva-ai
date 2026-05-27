import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/server/admin-auth";
import { upgradeUserPlan, type UserPlan } from "../../../../../lib/server/store";

type Params = { params: Promise<{ userId: string }> };

const isUserPlan = (value: unknown): value is UserPlan =>
  value === "free" || value === "pro" || value === "plus";

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { userId } = await params;
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };

  if (!isUserPlan(body.plan)) {
    return NextResponse.json({ ok: false, message: "Invalid plan." }, { status: 400 });
  }

  const updated = await upgradeUserPlan(userId, body.plan);
  if (!updated) {
    return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
