import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/server/admin-auth";
import { listAdminVerificationLogs } from "../../../../lib/server/store";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) {
    return admin.response;
  }

  const logs = await listAdminVerificationLogs();

  return NextResponse.json({
    ok: true,
    logs,
    emptyMessage: logs.length === 0 ? "Verification logging is not connected yet." : null
  });
}
