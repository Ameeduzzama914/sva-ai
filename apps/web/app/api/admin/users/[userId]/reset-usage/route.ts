import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../lib/server/admin-auth";
import { resetUserUsage } from "../../../../../../lib/server/store";

type Params = { params: Promise<{ userId: string }> };

export async function POST(request: Request, { params }: Params) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { userId } = await params;
  const updated = await resetUserUsage(userId);

  if (!updated) {
    return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
