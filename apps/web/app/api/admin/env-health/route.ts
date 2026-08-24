import { NextResponse } from "next/server";
import { getEnvironmentHealth } from "../../../../lib/server/env-manifest";
import { requireAdminSession } from "../../../../lib/server/admin-auth";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) return admin.response;

  return NextResponse.json({
    ok: true,
    environment: getEnvironmentHealth()
  });
}
