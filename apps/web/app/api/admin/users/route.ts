import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/server/admin-auth";
import { listAdminUsers } from "../../../../lib/server/store";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) {
    return admin.response;
  }

  const users = await listAdminUsers();

  return NextResponse.json({
    ok: true,
    users,
    canManagePlans: true
  });
}
