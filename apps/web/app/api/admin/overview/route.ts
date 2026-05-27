import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/server/admin-auth";
import { getAdminOverviewStats } from "../../../../lib/server/store";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) {
    return admin.response;
  }

  const overview = await getAdminOverviewStats();

  return NextResponse.json({
    ok: true,
    overview,
    pendingLabel: overview.dataSource === "empty" ? "Pending real analytics — no server datastore records yet." : null
  });
}
