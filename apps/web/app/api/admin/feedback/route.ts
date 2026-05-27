import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/server/admin-auth";
import { listAdminFeedback } from "../../../../lib/server/store";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) {
    return admin.response;
  }

  const feedback = await listAdminFeedback();

  return NextResponse.json({
    ok: true,
    feedback,
    emptyMessage:
      feedback.length === 0 ? "No centralized feedback storage connected yet." : null
  });
}
